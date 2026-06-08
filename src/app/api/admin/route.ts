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

    // ---- all sellers ----
    const { data: sellers } = await admin
      .from("sellers")
      .select("id, store_name, plan, status, total_sales, total_orders, created_at")
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
      .select("seller_id, total_cents, commission_cents, seller_payout_cents");

    const bySeller = new Map<string, { gross: number; commission: number; payout: number; units: number }>();
    let grossAll = 0, commissionAll = 0, payoutAll = 0;
    (items ?? []).forEach((it: any) => {
      const g = it.total_cents || 0;
      const c = it.commission_cents || 0;
      const p = it.seller_payout_cents || 0;
      grossAll += g; commissionAll += c; payoutAll += p;
      const cur = bySeller.get(it.seller_id) || { gross: 0, commission: 0, payout: 0, units: 0 };
      cur.gross += g; cur.commission += c; cur.payout += p; cur.units += 1;
      bySeller.set(it.seller_id, cur);
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

    return NextResponse.json({
      products: products ?? [],
      pending,
      sellers: sellers ?? [],
      orders: orders ?? [],
      accounting: {
        totals: { gross_cents: grossAll, commission_cents: commissionAll, payout_cents: payoutAll },
        bySeller: accountingRows,
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
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
