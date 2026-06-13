import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * POST /api/paystack/webhook
 *
 * Handles two kinds of events, distinguished by metadata.type:
 *   - product orders (default): charge.success -> mark order paid
 *   - growth_subscription: charge.success / subscription.create ->
 *       activate seller Growth; subscription.disable / invoice.payment_failed ->
 *       downgrade seller to Free and hide products over the Free limit.
 *
 * Signature: HMAC-SHA512 of the RAW body keyed with the secret key.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const FREE_PRODUCT_LIMIT = 5;

export async function POST(req: Request) {
  const raw = await req.text();

  const signature = req.headers.get("x-paystack-signature") || "";
  if (!SECRET) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }
  const expected = crypto.createHmac("sha512", SECRET).update(raw).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const valid =
    sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: any = {};
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const type = event?.event || "";
  const data = event?.data || {};
  const metaType = data?.metadata?.type || "";

  try {
    // ---------- GROWTH SUBSCRIPTION EVENTS ----------
    // First charge / subscription creation: activate Growth.
    if (
      (type === "charge.success" && metaType === "growth_subscription") ||
      type === "subscription.create"
    ) {
      // seller_id: from our metadata (charge.success) or by matching the
      // subscription's plan + customer for subscription.create.
      let sellerId: string = data?.metadata?.seller_id || "";
      const reference: string = data?.reference || "";
      const subscriptionCode: string = data?.subscription_code || data?.subscription?.subscription_code || "";
      const emailToken: string = data?.email_token || "";
      const nextPayment: string = data?.next_payment_date || data?.subscription?.next_payment_date || "";

      // Fallback 1: find seller by the pending subscription reference.
      if (!sellerId && reference) {
        const { data: subRow } = await admin
          .from("seller_subscriptions")
          .select("seller_id")
          .eq("paystack_reference", reference)
          .maybeSingle();
        sellerId = subRow?.seller_id || "";
      }

      // Fallback 2: resolve by customer email. This is the path that matters
      // for `subscription.create`, which carries the customer email + the
      // subscription_code but NONE of our metadata and no order reference.
      // charge.success and subscription.create can also arrive in either
      // order, so email is the only key both events independently carry.
      // email -> profiles.id (= sellers.user_id) -> seller.
      if (!sellerId) {
        const customerEmail: string =
          data?.customer?.email || data?.subscription?.customer?.email || "";
        if (customerEmail) {
          const { data: profileRow } = await admin
            .from("profiles")
            .select("id")
            .ilike("email", customerEmail)
            .maybeSingle();
          if (profileRow?.id) {
            const { data: sellerRow } = await admin
              .from("sellers")
              .select("id")
              .eq("user_id", profileRow.id)
              .maybeSingle();
            sellerId = sellerRow?.id || "";
          }
        }
      }

      if (sellerId) {
        // activate the seller on Growth
        await admin
          .from("sellers")
          .update({ plan: "growth", status: "active", approved_at: now, updated_at: now })
          .eq("id", sellerId);

        // update the subscription row
        const periodEnd = nextPayment || (() => {
          const d = new Date(); d.setMonth(d.getMonth() + 1); return d.toISOString();
        })();
        const subPatch: Record<string, unknown> = {
          plan: "growth",
          status: "active",
          amount_cents: 7000,
          current_period_start: now,
          current_period_end: periodEnd,
          next_billing_date: periodEnd,
          cancelled_at: null,
          updated_at: now,
        };
        if (subscriptionCode) subPatch.paystack_subscription_code = subscriptionCode;
        if (emailToken) subPatch.paystack_email_token = emailToken;
        if (reference) subPatch.paystack_reference = reference;

        const { data: existingSub } = await admin
          .from("seller_subscriptions")
          .select("id")
          .eq("seller_id", sellerId)
          .maybeSingle();
        if (existingSub) {
          await admin.from("seller_subscriptions").update(subPatch).eq("id", existingSub.id);
        } else {
          await admin.from("seller_subscriptions").insert({ seller_id: sellerId, ...subPatch });
        }
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Subscription ended / payment failed: downgrade to Free + hide excess products.
    if (type === "subscription.disable" || type === "invoice.payment_failed") {
      const subscriptionCode: string =
        data?.subscription_code || data?.subscription?.subscription_code || "";
      let sellerId = "";

      if (subscriptionCode) {
        const { data: subRow } = await admin
          .from("seller_subscriptions")
          .select("seller_id")
          .eq("paystack_subscription_code", subscriptionCode)
          .maybeSingle();
        sellerId = subRow?.seller_id || "";
      }

      if (sellerId) {
        // downgrade seller to Free
        await admin
          .from("sellers")
          .update({ plan: "free", updated_at: now })
          .eq("id", sellerId);

        // subscription row -> cancelled/free
        const { data: existingSub } = await admin
          .from("seller_subscriptions")
          .select("id")
          .eq("seller_id", sellerId)
          .maybeSingle();
        if (existingSub) {
          await admin
            .from("seller_subscriptions")
            .update({ plan: "free", status: "cancelled", cancelled_at: now, amount_cents: 0, updated_at: now })
            .eq("id", existingSub.id);
        }

        // hide products over the Free limit: keep the 5 OLDEST active, hide the rest
        const { data: activeProducts } = await admin
          .from("products")
          .select("id, created_at")
          .eq("seller_id", sellerId)
          .eq("status", "active")
          .order("created_at", { ascending: true });
        const list = activeProducts ?? [];
        if (list.length > FREE_PRODUCT_LIMIT) {
          const toHide = list.slice(FREE_PRODUCT_LIMIT).map((p: any) => p.id);
          if (toHide.length) {
            await admin
              .from("products")
              .update({ status: "draft", updated_at: now })
              .in("id", toHide);
          }
        }
      }
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // ---------- PRODUCT ORDER EVENTS ----------
    if (type === "charge.success" && metaType !== "growth_subscription") {
      const reference: string = data.reference || "";
      const orderIdMeta: string = data?.metadata?.order_id || "";
      const paystackStatus: string = data.status || "";

      if (paystackStatus === "success" && (reference || orderIdMeta)) {
        let query = admin.from("orders").select("id, status, paystack_reference");
        const { data: order } = reference
          ? await query.eq("paystack_reference", reference).maybeSingle()
          : await query.eq("id", orderIdMeta).maybeSingle();

        if (order && order.status !== "paid") {
          await admin
            .from("orders")
            .update({ status: "paid", paid_at: now, updated_at: now })
            .eq("id", order.id);
        }
      }
    }
  } catch (e) {
    console.error("Paystack webhook processing error:", e);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
