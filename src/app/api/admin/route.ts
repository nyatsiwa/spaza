import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * GET  /api/admin  -> { pending, products, sellers, orders, accounting }
 * POST /api/admin  -> perform an action (admin only)
 *
 * Accounting note: sellers are paid directly by Paystack via subaccount splits,
 * so there is no manual payout step. Accounting shows commission Spaza earned on
 * PAID orders (settled), a PENDING projection for unpaid orders, and a per-month
 * commission breakdown.
 */

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

    const { data: products } = await admin
      .from("products")
      .select("id, name, price_cents, stock_qty, status, images, rejection_reason, seller_id, created_at, sellers(store_name)")
      .order("created_at", { ascending: false });

    const pending = (products ?? []).filter((p: any) => p.status === "pending");

    const { data: pendingReviews } = await admin
      .from("reviews")
      .select("id, product_id, rating, title, body, created_at, products(name)")
      .eq("is_approved", false)
      .order("created_at", { ascending: false });

    const { data: sellers } = await admin
      .from("sellers")
      .select("id, store_name, plan, status, total_sales, total_orders, bank_name, bank_account_number, bank_branch_code, bank_account_type, paystack_bank_code, paystack_subaccount_code, created_at")
      .order("created_at", { ascending: false });

    const { data: orders } = await admin
      .from("orders")
      .select("id, order_number, status, subtotal_cents, shipping_cents, total_cents, commission_cents, seller_amount_cents, spaza_amount_cents, seller_id, paid_at, shipping_name, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    // ---- accounting: paid (settled) vs pending (projection) ----
    const PAID = new Set(["paid", "processing", "shipped", "delivered"]);
    const DEAD = new Set(["cancelled", "refunded"]);

    const storeName = new Map<string, string>();
    (sellers ?? []).forEach((s: any) => storeName.set(s.id, s.store_name));

    let paidGross = 0, paidCommission = 0, paidSellerAmt = 0;
    let pendGross = 0, pendCommission = 0, pendSellerAmt = 0;

    const monthMap = new Map<string, { gross: number; commission: number; orders: number }>();
    const sellerMap = new Map<string, { gross: number; commission: number; sellerAmt: number; orders: number }>();

    (orders ?? []).forEach((o: any) => {
      if (DEAD.has(o.status)) return;
      const gross = o.subtotal_cents || 0;
      const commission = o.commission_cents || 0;
      const sellerAmt = o.seller_amount_cents != null ? o.seller_amount_cents : (gross - commission);
      const isPaid = PAID.has(o.status);

      if (isPaid) {
        paidGross += gross; paidCommission += commission; paidSellerAmt += sellerAmt;
        const when = o.paid_at || o.created_at;
        if (when) {
          const d = new Date(when);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          const mb = monthMap.get(key) || { gross: 0, commission: 0, orders: 0 };
          mb.gross += gross; mb.commission += commission; mb.orders += 1;
          monthMap.set(key, mb);
        }
        if (o.seller_id) {
          const sm = sellerMap.get(o.seller_id) || { gross: 0, commission: 0, sellerAmt: 0, orders: 0 };
          sm.gross += gross; sm.commission += commission; sm.sellerAmt += sellerAmt; sm.orders += 1;
          sellerMap.set(o.seller_id, sm);
        }
      } else {
        pendGross += gross; pendCommission += commission; pendSellerAmt += sellerAmt;
      }
    });

    const commissionByMonth = Array.from(monthMap.entries())
      .map(([month, v]) => {
        const [y, m] = month.split("-");
        return {
          month,
          label: `${MONTHS_LONG[Number(m) - 1]} ${y}`,
          gross_cents: v.gross,
          commission_cents: v.commission,
          order_count: v.orders,
        };
      })
      .sort((a, b) => (a.month < b.month ? 1 : -1));

    const bySeller = Array.from(sellerMap.entries())
      .map(([sid, v]) => ({
        seller_id: sid,
        store_name: storeName.get(sid) || "(unknown)",
        gross_cents: v.gross,
        commission_cents: v.commission,
        seller_amount_cents: v.sellerAmt,
        order_count: v.orders,
      }))
      .sort((a, b) => b.commission_cents - a.commission_cents);

    return NextResponse.json({
      products: products ?? [],
      pending,
      pendingReviews: pendingReviews ?? [],
      sellers: sellers ?? [],
      orders: orders ?? [],
      accounting: {
        paid: { gross_cents: paidGross, commission_cents: paidCommission, seller_amount_cents: paidSellerAmt },
        pending: { gross_cents: pendGross, commission_cents: pendCommission, seller_amount_cents: pendSellerAmt },
        commissionByMonth,
        bySeller,
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
      case "create_subaccount": {
        const sellerId = String(body?.sellerId || "");
        if (!sellerId) return NextResponse.json({ error: "Missing sellerId" }, { status: 400 });
        const secret = process.env.PAYSTACK_SECRET_KEY || "";
        if (!secret)
          return NextResponse.json({ error: "Paystack not configured (PAYSTACK_SECRET_KEY missing)." }, { status: 500 });

        const { data: seller, error: sErr } = await admin
          .from("sellers")
          .select("id, store_name, plan, bank_account_number, paystack_bank_code, paystack_subaccount_code")
          .eq("id", sellerId)
          .single();
        if (sErr || !seller)
          return NextResponse.json({ error: sErr?.message || "Seller not found" }, { status: 404 });
        if (seller.paystack_subaccount_code)
          return NextResponse.json({ error: "Subaccount already exists for this seller." }, { status: 409 });
        if (!seller.paystack_bank_code || !seller.bank_account_number)
          return NextResponse.json({ error: "Seller must choose a bank and account number first." }, { status: 400 });

        const pct = seller.plan === "growth" ? 5 : 8;

        const res = await fetch("https://api.paystack.co/subaccount", {
          method: "POST",
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            business_name: seller.store_name || "Spaza seller",
            settlement_bank: seller.paystack_bank_code,
            account_number: seller.bank_account_number,
            percentage_charge: pct,
          }),
        });
        const pj = await res.json().catch(() => ({} as any));
        if (!res.ok || !pj?.status)
          return NextResponse.json(
            { error: pj?.message || "Paystack subaccount creation failed.", detail: pj },
            { status: 502 }
          );

        const subaccountCode = pj?.data?.subaccount_code || "";
        if (!subaccountCode)
          return NextResponse.json({ error: "Paystack did not return a subaccount code.", detail: pj }, { status: 502 });

        await admin
          .from("sellers")
          .update({ paystack_subaccount_code: subaccountCode, updated_at: now })
          .eq("id", sellerId);

        return NextResponse.json({ ok: true, subaccount_code: subaccountCode });
      }
      case "approve_review": {
        const reviewId = String(body?.reviewId || "");
        if (!reviewId) return NextResponse.json({ error: "Missing reviewId" }, { status: 400 });
        const { data: rev, error: e1 } = await admin
          .from("reviews").update({ is_approved: true }).eq("id", reviewId).select("product_id").single();
        if (e1 || !rev) return NextResponse.json({ error: e1?.message || "not found" }, { status: 500 });
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
        // TESTING AID: flip an order to paid. Now a fallback since the Paystack webhook is live.
        const orderId = String(body?.orderId || "");
        if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
        const { error } = await admin
          .from("orders")
          .update({ status: "paid", paid_at: now, updated_at: now })
          .eq("id", orderId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      case "unmark_order_paid": {
        const orderId = String(body?.orderId || "");
        if (!orderId) return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
        const { error } = await admin
          .from("orders")
          .update({ status: "pending", paid_at: null, updated_at: now })
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
