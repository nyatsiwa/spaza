import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * GET /api/seller/orders -> { orders: [...] }
 * Returns the authenticated seller's sold line items, each with the parent
 * order's number, date, status and shipping destination so they know what to
 * ship and where. Admin client + seller_id match = ownership enforced.
 */

async function resolveSeller(req: Request) {
  const admin = createAdminClient();
  let user: { id: string } | null = null;
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
  if (!user) return { admin, user: null, seller: null as any };
  const { data: seller } = await admin
    .from("sellers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { admin, user, seller };
}

export async function GET(req: Request) {
  try {
    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });

    const { data: items, error } = await admin
      .from("order_items")
      .select(
        "id, product_name, product_image, quantity, unit_price_cents, total_cents, seller_payout_cents, tracking_number, shipped_at, delivered_at, created_at, " +
          "orders(order_number, status, created_at, shipping_name, shipping_city, shipping_province)"
      )
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ orders: items ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
