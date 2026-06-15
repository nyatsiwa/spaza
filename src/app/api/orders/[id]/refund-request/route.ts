import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/orders/[id]/refund-request
 *
 * Body: { reason_type: "defective" | "not_as_described" | "discretionary",
 *         reason_note?: string }
 *
 * Buyer-initiated. Creates an order_refunds row in "requested" status for
 * admin review. It does NOT move money — approval (admin route) does.
 *
 * Window rule (South African CPA):
 *   - "discretionary" (change of mind / no fault): only allowed within
 *     7 days of delivery. There is no general right of return, so this is
 *     a goodwill window we enforce.
 *   - "defective" / "not_as_described": these are CPA quality rights
 *     (implied warranty, ~6 months). NOT blocked by the 7-day cutoff.
 *
 * "Delivered" date = the latest delivered_at across the order's items
 * (delivered_at lives on order_items, not orders).
 */

const DISCRETIONARY_WINDOW_DAYS = 7;

// Orders that represent a completed sale and are therefore refundable.
const REFUNDABLE_STATUSES = new Set([
  "paid",
  "processing",
  "shipped",
  "delivered",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ error: "Missing order id." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reasonType = String(body?.reason_type || "").toLowerCase();
    const reasonNote =
      typeof body?.reason_note === "string" ? body.reason_note.trim() : null;

    if (
      reasonType !== "defective" &&
      reasonType !== "not_as_described" &&
      reasonType !== "discretionary"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid reason. Choose 'defective', 'not_as_described', or 'discretionary'.",
        },
        { status: 400 }
      );
    }

    // ---- authenticate the buyer ----
    const admin = createAdminClient();
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
    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in to request a refund." },
        { status: 401 }
      );
    }

    // ---- load the order (must belong to this buyer) ----
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select(
        "id, buyer_id, seller_id, status, total_cents, seller_amount_cents, paystack_reference"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      return NextResponse.json(
        { error: `Order lookup failed: ${orderErr.message}` },
        { status: 500 }
      );
    }
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (order.buyer_id !== user.id) {
      return NextResponse.json(
        { error: "This order doesn't belong to you." },
        { status: 403 }
      );
    }

    if (!REFUNDABLE_STATUSES.has(order.status)) {
      return NextResponse.json(
        {
          error:
            order.status === "refunded" || order.status === "refund_requested"
              ? "A refund has already been requested or processed for this order."
              : `This order can't be refunded in its current state (${order.status}).`,
        },
        { status: 409 }
      );
    }
    if (!order.paystack_reference) {
      return NextResponse.json(
        { error: "This order has no payment on record to refund." },
        { status: 409 }
      );
    }

    // ---- block duplicate active requests ----
    const { data: existing } = await admin
      .from("order_refunds")
      .select("id, status")
      .eq("order_id", orderId)
      .in("status", ["requested", "approved", "processing", "processed"])
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "There's already an active refund request for this order." },
        { status: 409 }
      );
    }

    // ---- 7-day window check (discretionary only) ----
    if (reasonType === "discretionary") {
      const { data: items } = await admin
        .from("order_items")
        .select("delivered_at")
        .eq("order_id", orderId);

      const deliveredDates = (items ?? [])
        .map((i: any) => i.delivered_at)
        .filter(Boolean)
        .map((d: string) => new Date(d).getTime());

      if (deliveredDates.length === 0) {
        return NextResponse.json(
          {
            error:
              "This order isn't marked delivered yet. A change-of-mind refund can only be requested within 7 days of delivery. If the item is faulty or not as described, please choose that reason instead.",
          },
          { status: 409 }
        );
      }

      const lastDelivered = Math.max(...deliveredDates);
      const ageDays = (Date.now() - lastDelivered) / (1000 * 60 * 60 * 24);
      if (ageDays > DISCRETIONARY_WINDOW_DAYS) {
        return NextResponse.json(
          {
            error: `The ${DISCRETIONARY_WINDOW_DAYS}-day change-of-mind window has passed for this order. If the item is faulty or not as described, you may still be entitled to a refund — please choose that reason instead.`,
          },
          { status: 409 }
        );
      }
    }

    // ---- create the request ----
    const sellerSlice =
      order.seller_amount_cents != null ? order.seller_amount_cents : 0;

    const { data: created, error: insErr } = await admin
      .from("order_refunds")
      .insert({
        order_id: order.id,
        buyer_id: user.id,
        seller_id: order.seller_id,
        reason_type: reasonType,
        reason_note: reasonNote,
        amount_cents: order.total_cents, // v1: full-order refunds
        seller_amount_cents: sellerSlice,
        status: "requested",
        paystack_reference: order.paystack_reference,
      })
      .select("id")
      .single();

    if (insErr || !created) {
      return NextResponse.json(
        { error: `Could not create refund request: ${insErr?.message}` },
        { status: 500 }
      );
    }

    // mark the order as having a refund in progress (visible to seller/admin)
    await admin
      .from("orders")
      .update({ status: "refund_requested", updated_at: new Date().toISOString() })
      .eq("id", order.id);

    return NextResponse.json({
      ok: true,
      refundId: created.id,
      message:
        "Refund request submitted. Our team will review it and you'll be notified of the outcome.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Unexpected error: ${err?.message || String(err)}` },
      { status: 500 }
    );
  }
}
