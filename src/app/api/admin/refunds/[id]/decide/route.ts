import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/admin/refunds/[id]/decide
 *
 * Body: { decision: "approve" | "reject", admin_note?: string }
 *
 * Admin-only. On "approve" we call Paystack's Refund API against the order's
 * original transaction reference. We do NOT mark the order "refunded" here —
 * that happens when the refund.processed webhook lands. We only kick it off
 * and leave the refund row in "processing".
 *
 * On "reject" we close the request and restore the order to its prior status.
 *
 * Paystack note: transaction charges (gateway fees) are NOT refundable, so a
 * full refund still costs us the original processing fee. The buyer gets the
 * full amount; we absorb the fee.
 */

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

// status the order should fall back to if a refund is rejected / fails.
// We snapshot the real prior status on the order row, but default to "paid".
async function adminGuard(req: Request, admin: ReturnType<typeof createAdminClient>) {
  let user = null as { id: string; email?: string } | null;
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    const { data } = await admin.auth.getUser(token);
    user = data.user as any;
  }
  if (!user) {
    const serverClient = await createServerSupabaseClient();
    const { data } = await serverClient.auth.getUser();
    user = data.user as any;
  }
  if (!user) return { user: null, isAdmin: false };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { user, isAdmin: profile?.role === "admin" };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: refundId } = await params;
    if (!refundId) {
      return NextResponse.json({ error: "Missing refund id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const decision = String(body?.decision || "").toLowerCase();
    const adminNote =
      typeof body?.admin_note === "string" ? body.admin_note.trim() : null;

    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json(
        { error: "Decision must be 'approve' or 'reject'." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { user, isAdmin } = await adminGuard(req, admin);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (!isAdmin) {
      return NextResponse.json(
        { error: "not_admin" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();

    // ---- load the refund request ----
    const { data: refund, error: refErr } = await admin
      .from("order_refunds")
      .select(
        "id, order_id, status, amount_cents, paystack_reference"
      )
      .eq("id", refundId)
      .maybeSingle();

    if (refErr) {
      return NextResponse.json(
        { error: `Refund lookup failed: ${refErr.message}` },
        { status: 500 }
      );
    }
    if (!refund) {
      return NextResponse.json({ error: "Refund not found." }, { status: 404 });
    }
    if (refund.status !== "requested") {
      return NextResponse.json(
        { error: `This refund is already ${refund.status}.` },
        { status: 409 }
      );
    }

    // ---------- REJECT ----------
    if (decision === "reject") {
      await admin
        .from("order_refunds")
        .update({
          status: "rejected",
          admin_note: adminNote,
          decided_by: user.id,
          decided_at: now,
          updated_at: now,
        })
        .eq("id", refund.id);

      // restore the order to its prior status (saved when it went to
      // refund_requested; default to "paid" if not recorded)
      const { data: ord } = await admin
        .from("orders")
        .select("pre_refund_status")
        .eq("id", refund.order_id)
        .maybeSingle();
      const restore = ord?.pre_refund_status || "paid";
      await admin
        .from("orders")
        .update({ status: restore, updated_at: now })
        .eq("id", refund.order_id);

      return NextResponse.json({ ok: true, status: "rejected" });
    }

    // ---------- APPROVE -> fire Paystack refund ----------
    if (!PAYSTACK_SECRET) {
      return NextResponse.json(
        {
          error: "Billing is not configured.",
          detail: "PAYSTACK_SECRET_KEY is missing from the environment.",
        },
        { status: 500 }
      );
    }
    if (!refund.paystack_reference) {
      return NextResponse.json(
        { error: "This refund has no transaction reference to refund against." },
        { status: 409 }
      );
    }

    // Snapshot current order status so a failed refund can restore it.
    const { data: ord } = await admin
      .from("orders")
      .select("status")
      .eq("id", refund.order_id)
      .maybeSingle();
    const priorStatus = ord?.status || "paid";

    // Paystack Refund API. Amount is in the minor unit (kobo/cents).
    // Omitting amount would refund the full transaction; we pass it
    // explicitly to be unambiguous for v1 full-order refunds.
    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transaction: refund.paystack_reference,
        amount: refund.amount_cents,
      }),
    });

    const json: any = await res.json().catch(() => null);

    if (!res.ok || !json?.status) {
      return NextResponse.json(
        {
          error: "Paystack rejected the refund.",
          detail:
            json?.message ||
            `Paystack /refund returned HTTP ${res.status}.`,
        },
        { status: 502 }
      );
    }

    // Refund accepted by Paystack and now "pending"/"processing" on their side.
    // Mark our request processing; the webhook will finalize it.
    await admin
      .from("order_refunds")
      .update({
        status: "processing",
        paystack_refund_status: json?.data?.status || "pending",
        admin_note: adminNote,
        decided_by: user.id,
        decided_at: now,
        updated_at: now,
      })
      .eq("id", refund.id);

    // keep the order in refund_requested but stash the prior status so a
    // failed-refund webhook can restore it.
    await admin
      .from("orders")
      .update({
        status: "refund_requested",
        pre_refund_status: priorStatus,
        updated_at: now,
      })
      .eq("id", refund.order_id);

    return NextResponse.json({
      ok: true,
      status: "processing",
      message:
        "Refund initiated with Paystack. It will complete via webhook; the buyer typically receives funds within 3–10 working days.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Unexpected error: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
