import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * GET  /api/admin            -> { pending, products, sellers, orders, accounting }
 * POST /api/admin            -> perform an action (admin only)
 *   body: { action, ... }
 *     approve_product  { productId }
 *     reject_product   { productId, reason }
 *     set_product_status { productId, status }     // active | removed | pending
 *     suspend_seller   { sellerId }
 *     activate_seller  { sellerId }
 *
 * Every request verifies the caller's profiles.role === 'admin' using the admin
 * (service-role) client, so RLS never blocks the admin's cross-tenant view.
 */

const COMMISSION_RATE: Record<string, number> = { free: 0.08, growth: 0.05 };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Bucket a timestamp into a calendar half-month period (1–14 or 15–end). */
function halfMonth(ts: string): { start: string; end: string } {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11
  const day = d.getUTCDate();
  const firstHalf = day <= 14;
  const startDay = firstHalf ? 1 : 15;
  const endDate = firstHalf ? new Date(Date.UTC(y, m, 14)) : new Date(Date.UTC(y, m + 1, 0));
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  return { start: iso(new Date(Date.UTC(y, m, startDay))), end: iso(endDate) };
}

/** "1–14 Jun 2026" / "15–30 Jun 2026" */
function periodLabel(startISO: string, endISO: string): string {
  const s = new Date(startISO);
  const e = new Date(endISO);
  return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
}

async function resolveAdmin(req: Request) {
  const admin = createAdminClient();

  let user: { id: string; email?: string } | null = null;
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
  if (!user) return { admin, user: null, isAdmin: false };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return { admin, user, isAdmin: profile?.role === "admin" };
}

export async function GET(req: Request) {
  try {
    const { admin, user, isAdmin } = await resolveAdmin(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!isAdmin)
      return NextResponse.json({ error: "not_admin" }, { status: 403 });

    // ---- all products (join seller store name) ----
    const { data: products } = await admin
      .from("products")
      .select("id, name, price_cents, stock_qty, status, images, rejection_reason, seller_id, created_at, sellers(store_name)")
      .order("created_at", { ascending: false });

    const pending = (products ?? []).filter((p: any) => p.status === "pending");

    // ---- pending reviews (awaiting approval) ----
    const { data: pendingReviews } = await admin
      .from("reviews")
      .select("id, product_id, rating, title, body, created_at, products(name)")
      .eq("is_approved", false)
      .order("created_at", { ascending: false });

    // ---- all sellers ----
    const { data: sellers } = await admin
      .from("sellers")
      .select("id, store_name, plan, status, total_sales, total_orders, bank_name, bank_account_number, bank_branch_code, bank_account_type, created_at")
      .order("created_at", { ascending: false });

    // ---- all orders ----
    const { data: orders } = await admin
      .from("orders")
      .select("id, order_number, status, subtotal_cents, shipping_cents, total_cents, shipping_name, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    // ---- accounting (EXPECTED/PENDING figures from order_items) ----
    // NOTE: these are computed from orders placed, not from settled payments,
    // because PayFast settlement isn't wired yet. Labelled as such in the UI.
    const { data: items } = await admin
      .from("order_items")
      .select("seller_id, total_cents, commission_cents, seller_payout_cents, orders(created_at)");

    const bySeller = new Map<string, { gross: number; commission: number; payout: number; units: number }>();
    let grossAll = 0, commissionAll = 0, payoutAll = 0;

    // half-month payout buckets: key `${seller_id}|${period_start}`
    const buckets = new Map<string, { seller_id: string; start: string; end: string; amount: number }>();

    (items ?? []).forEach((it: any) => {
      const g = it.total_cents || 0;
      const c = it.commission_cents || 0;
      const p = it.seller_payout_cents || 0;
      grossAll += g; commissionAll += c; payoutAll += p;
      const cur = bySeller.get(it.seller_id) || { gross: 0, commission: 0, payout: 0, units: 0 };
      cur.gross += g; cur.commission += c; cur.payout += p; cur.units += 1;
      bySeller.set(it.seller_id, cur);

      // bucket the seller payout into a half-month period by order date
      const created = it.orders?.created_at;
      if (created) {
        const { start, end } = halfMonth(created);
        const key = `${it.seller_id}|${start}`;
        const b = buckets.get(key) || { seller_id: it.seller_id, start, end, amount: 0 };
        b.amount += p;
        buckets.set(key, b);
      }
    });

    const storeName = new Map<string, string>();
    (sellers ?? []).forEach((s: any) => storeName.set(s.id, s.store_name));

    const accountingRows = Array.from(bySeller.entries()).map(([sid, v]) => ({
      seller_id: sid,
      store_name: storeName.get(sid) || "(unknown)",
      gross_cents: v.gross,
      commission_cents: v.commission,
      payout_cents: v.payout,
      line_items: v.units,
    })).sort((a, b) => b.gross_cents - a.gross_cents);

    // existing payout records (what's already been marked paid)
    const { data: paidRows } = await admin
      .from("seller_payouts")
      .select("seller_id, period_start, status, paid_at");
    const paidMap = new Map<string, { status: string; paid_at: string | null }>();
    (paidRows ?? []).forEach((r: any) =>
      paidMap.set(`${r.seller_id}|${r.period_start}`, { status: r.status, paid_at: r.paid_at })
    );

    const todayISO = new Date().toISOString().slice(0, 10);
    const payoutsBySellerMap = new Map<string, any[]>();
    Array.from(buckets.values()).forEach((b) => {
      const key = `${b.seller_id}|${b.start}`;
      const paidInfo = paidMap.get(key);
      const paid = paidInfo?.status === "paid";
      const closed = b.end < todayISO; // period has fully elapsed
      const list = payoutsBySellerMap.get(b.seller_id) || [];
      list.push({
        period_start: b.start,
        period_end: b.end,
        label: periodLabel(b.start, b.end),
        amount_cents: b.amount,
        paid,
        paid_at: paidInfo?.paid_at || null,
        due: !paid && closed && b.amount > 0,
      });
      payoutsBySellerMap.set(b.seller_id, list);
    });

    const bankBySeller = new Map<string, any>();
    (sellers ?? []).forEach((s: any) => bankBySeller.set(s.id, {
      bank_name: s.bank_name || null,
      bank_account_number: s.bank_account_number || null,
      bank_branch_code: s.bank_branch_code || null,
      bank_account_type: s.bank_account_type || null,
      complete: !!(s.bank_name && s.bank_account_number && s.bank_branch_code && s.bank_account_type),
    }));

    const payouts = Array.from(payoutsBySellerMap.entries()).map(([sid, periods]) => ({
      seller_id: sid,
      store_name: storeName.get(sid) || "(unknown)",
      banking: bankBySeller.get(sid) || { complete: false },
      periods: periods.sort((a: any, b: any) => (a.period_start < b.period_start ? 1 : -1)),
    })).sort((a, b) => (a.store_name > b.store_name ? 1 : -1));

    return NextResponse.json({
      products: products ?? [],
      pending,
      pendingReviews: pendingReviews ?? [],
      sellers: sellers ?? [],
      orders: orders ?? [],
      accounting: {
        totals: { gross_cents: grossAll, commission_cents: commissionAll, payout_cents: payoutAll },
        bySeller: accountingRows,
        payouts,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { admin, user, isAdmin } = await resolveAdmin(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!isAdmin)
      return NextResponse.json({ error: "not_admin" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const now = new Date().toISOString();

    switch (action) {
      case "approve_product": {
        const productId = String(body?.productId || "");
        if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
        const { error } = await admin
          .from("products")
          .update({ status: "active", rejection_reason: null, published_at: now, updated_at: now })
          .eq("id", productId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "reject_product": {
        const productId = String(body?.productId || "");
        const reason = String(body?.reason || "").trim() || "Did not meet listing guidelines.";
        if (!productId) return NextResponse.json({ error: "Missing productId" }, { status: 400 });
        const { error } = await admin
          .from("products")
          .update({ status: "rejected", rejection_reason: reason, updated_at: now })
          .eq("id", productId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "set_product_status": {
        const productId = String(body?.productId || "");
        const status = String(body?.status || "");
        const allowed = ["active", "removed", "pending", "draft", "out_of_stock"];
        if (!productId || !allowed.includes(status))
          return NextResponse.json({ error: "Bad request" }, { status: 400 });
        const patch: Record<string, unknown> = { status, updated_at: now };
        if (status === "active") patch.published_at = now;
        const { error } = await admin.from("products").update(patch).eq("id", productId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "suspend_seller": {
        const sellerId = String(body?.sellerId || "");
        if (!sellerId) return NextResponse.json({ error: "Missing sellerId" }, { status: 400 });
        const { error } = await admin.from("sellers").update({ status: "suspended", updated_at: now }).eq("id", sellerId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "activate_seller": {
        const sellerId = String(body?.sellerId || "");
        if (!sellerId) return NextResponse.json({ error: "Missing sellerId" }, { status: 400 });
        const { error } = await admin.from("sellers").update({ status: "active", updated_at: now }).eq("id", sellerId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "pay_payout": {
        const sellerId = String(body?.sellerId || "");
        const periodStart = String(body?.periodStart || "");
        const periodEnd = String(body?.periodEnd || "");
        const amountCents = Math.max(0, Math.floor(Number(body?.amountCents) || 0));
        if (!sellerId || !periodStart || !periodEnd)
          return NextResponse.json({ error: "Missing payout details" }, { status: 400 });
        const { error } = await admin
          .from("seller_payouts")
          .upsert(
            { seller_id: sellerId, period_start: periodStart, period_end: periodEnd, amount_cents: amountCents, status: "paid", paid_at: now },
            { onConflict: "seller_id,period_start" }
          );
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "unpay_payout": {
        const sellerId = String(body?.sellerId || "");
        const periodStart = String(body?.periodStart || "");
        if (!sellerId || !periodStart)
          return NextResponse.json({ error: "Missing payout details" }, { status: 400 });
        const { error } = await admin
          .from("seller_payouts")
          .delete()
          .eq("seller_id", sellerId)
          .eq("period_start", periodStart);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "approve_review": {
        const reviewId = String(body?.reviewId || "");
        if (!reviewId) return NextResponse.json({ error: "Missing reviewId" }, { status: 400 });
        const { data: rev, error: e1 } = await admin
          .from("reviews").update({ is_approved: true }).eq("id", reviewId).select("product_id").single();
        if (e1 || !rev) return NextResponse.json({ error: e1?.message || "not found" }, { status: 500 });
        // recompute the product's rating + review_count from approved reviews
        const { data: approved } = await admin
          .from("reviews").select("rating").eq("product_id", rev.product_id).eq("is_approved", true);
        const list = approved ?? [];
        const avg = list.length ? list.reduce((s: number, r: any) => s + (r.rating || 0), 0) / list.length : 0;
        await admin.from("products").update({ rating: Math.round(avg * 10) / 10, review_count: list.length }).eq("id", rev.product_id);
        return NextResponse.json({ ok: true });
      }
      case "reject_review": {
        const reviewId = String(body?.reviewId || "");
        if (!reviewId) return NextResponse.json({ error: "Missing reviewId" }, { status: 400 });
        const { error } = await admin.from("reviews").delete().eq("id", reviewId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "mark_order_paid": {
        // TESTING AID: flip an order to paid so the fulfilment/waybill flow can
        // be exercised before PayFast settlement is live.
        const orderId = String(body?.orderId || "");
        if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
        const { error } = await admin
          .from("orders")
          .update({ status: "paid", updated_at: new Date().toISOString() })
          .eq("id", orderId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "unmark_order_paid": {
        const orderId = String(body?.orderId || "");
        if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
        const { error } = await admin
          .from("orders")
          .update({ status: "pending", updated_at: new Date().toISOString() })
          .eq("id", orderId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
