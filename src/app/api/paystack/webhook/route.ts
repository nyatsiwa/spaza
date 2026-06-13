import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * POST /api/paystack/webhook
 *
 * Paystack calls this after payment events. We:
 *   1. Verify the x-paystack-signature header (HMAC-SHA512 of the RAW body,
 *      keyed with our secret key). This must use the raw, unmodified body —
 *      re-serialising JSON would break the hash.
 *   2. On charge.success, match the reference -> order -> flip to "paid".
 *      Marking an order paid auto-unlocks the seller's waybill flow.
 *
 * Always returns 200 quickly once verified so Paystack doesn't retry; any
 * processing problems are logged but not surfaced as non-200 (which would
 * trigger retries). A failed signature returns 401.
 */

// Ensure this runs on the Node.js runtime (crypto + raw body).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.PAYSTACK_SECRET_KEY || "";

export async function POST(req: Request) {
  // Read the RAW body exactly as sent (do not JSON.parse before hashing).
  const raw = await req.text();

  // 1. Verify signature
  const signature = req.headers.get("x-paystack-signature") || "";
  if (!SECRET) {
    // Misconfiguration — don't process, but don't make Paystack retry forever.
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }
  const expected = crypto.createHmac("sha512", SECRET).update(raw).digest("hex");

  // constant-time compare
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const valid =
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  // 2. Parse and handle the event
  let event: any = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    if (event?.event === "charge.success") {
      const data = event.data || {};
      const reference: string = data.reference || "";
      const orderIdMeta: string = data?.metadata?.order_id || "";
      const paystackStatus: string = data.status || "";

      if (paystackStatus === "success" && (reference || orderIdMeta)) {
        const admin = createAdminClient();
        const now = new Date().toISOString();

        // Match by reference first (what we stored at checkout), fall back to
        // the order_id we put in metadata.
        let query = admin.from("orders").select("id, status, paystack_reference");
        const { data: order } = reference
          ? await query.eq("paystack_reference", reference).maybeSingle()
          : await query.eq("id", orderIdMeta).maybeSingle();

        if (order && order.status !== "paid") {
          await admin
            .from("orders")
            .update({ status: "paid", updated_at: now })
            .eq("id", order.id);
        }
      }
    }
  } catch (e) {
    // Log only — still return 200 so Paystack doesn't hammer retries on a
    // transient DB hiccup; we can reconcile manually if needed.
    console.error("Paystack webhook processing error:", e);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
