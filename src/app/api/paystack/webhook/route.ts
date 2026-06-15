import { NextResponse } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase-server";

/**
 * POST /api/paystack/webhook
 *
 * Handles:
 *   - refund events (refund.*)              -> finalize order_refunds + order
 *   - growth_subscription (charge.success / subscription.create) -> activate seller
 *   - subscription.disable / invoice.payment_failed -> downgrade seller
 *   - product orders (charge.success)       -> mark order paid
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
    // ---------- REFUND EVENTS ----------
    if (type.startsWith("refund.")) {
      const txnRef: string =
        data?.transaction_reference ||
        data?.transaction?.reference ||
        data?.reference ||
        "";

      if (!txnRef) {
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const { data: refundRow } = await admin
        .from("order_refunds")
        .select("id, order_id, seller_amount_cents, status")
        .eq("paystack_reference", txnRef)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!refundRow) {
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const paystackStatus = data?.status || type.replace("refund.", "");

      // terminal: processed
      if (type === "refund.processed") {
        await admin
          .from("order_refunds")
          .update({
            status: "processed",
            paystack_refund_status: "processed",
            resolved_at: now,
            updated_at: now,
          })
          .eq("id", refundRow.id);

        await admin
          .from("orders")
          .update({ status: "refunded", refunded_at: now, updated_at: now })
          .eq("id", refundRow.order_id);

        // seller recovery flagged for admin confirmation (Paystack may have
        // auto-reversed the subaccount, or already settled it to the seller).
        await admin
          .from("order_refunds")
          .update({ seller_recovery_status: "chase_seller", updated_at: now })
          .eq("id", refundRow.id);

        return NextResponse.json({ received: true }, { status: 200 });
      }

      // terminal: failed -> restore order
      if (type === "refund.failed") {
        await admin
          .from("order_refunds")
          .update({
            status: "failed",
            paystack_refund_status: "failed",
            updated_at: now,
          })
          .eq("id", refundRow.id);

        const { data: ord } = await admin
          .from("orders")
          .select("pre_refund_status")
          .eq("id", refundRow.order_id)
          .maybeSingle();
        const restore = ord?.pre_refund_status || "paid";
        await admin
          .from("orders")
          .update({ status: restore, updated_at: now })
          .eq("id", refundRow.order_id);

        return NextResponse.json({ received: true }, { status: 200 });
      }

      // needs-attention: bank details missing
      if (type === "refund.needs-attention") {
        await admin
          .from("order_refunds")
          .update({
            paystack_refund_status: "needs-attention",
            admin_note:
              "Paystack needs the customer's bank details to complete this refund (use the Retry Refund API).",
            updated_at: now,
          })
          .eq("id", refundRow.id);
        return NextResponse.json({ received: true }, { status: 200 });
      }

      // non-terminal: pending / processing
      await admin
        .from("order_refunds")
        .update({ paystack_refund_status: paystackStatus, updated_at: now })
        .eq("id", refundRow.id);

      return NextResponse.json({ received: true }, { status: 200 });
    }

    // ---------- GROWTH SUBSCRIPTION EVENTS ----------
    if (
      (type === "charge.success" && metaType === "growth_subscription") ||
      type === "subscription.create"
    ) {
      let sellerId: string = data?.metadata?.seller_id || "";
      const reference: string = data?.reference || "";
      const subscriptionCode: string =
        data?.subscription_code || data?.subscription?.subscription_code || "";
      const emailToken: string = data?.email_token || "";
      const nextPayment: string =
        data?.next_payment_date || data?.subscription?.next_payment_date || "";

      // Fallback 1: find seller by the pending subscription reference.
      if (!sellerId && reference) {
        const { data: subRow } = await admin
          .from("seller_subscriptions")
          .select("seller_id")
          .eq("paystack_reference", reference)
          .maybeSingle();
        sellerId = subRow?.seller_id || "";
      }

      // Fallback 2: resolve by customer email (subscription.create path).
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
        await admin
          .from("sellers")
          .update({ plan: "growth", status: "active", approved_at: now, updated_at: now })
          .eq("id", sellerId);

        const periodEnd =
          nextPayment ||
          (() => {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            return d.toISOString();
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
        await admin
          .from("sellers")
          .update({ plan: "free", updated_at: now })
          .eq("id", sellerId);

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
