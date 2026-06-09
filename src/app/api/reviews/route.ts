import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/reviews   body: { productId, rating, title, body }
 *
 * Creates a review ONLY if the user actually purchased the product (verified
 * purchase). The review is stored is_verified=true, is_approved=false — it
 * stays hidden until an admin approves it in /admin. One review per buyer per
 * product.
 */

async function resolveUser(req: Request) {
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
  return { admin, user };
}

export async function POST(req: Request) {
  try {
    const { admin, user } = await resolveUser(req);
    if (!user)
      return NextResponse.json({ error: "Please sign in to write a review." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const productId = String(body?.productId || "").trim();
    const rating = Math.round(Number(body?.rating));
    const title = String(body?.title || "").trim().slice(0, 120) || null;
    const text = String(body?.body || "").trim().slice(0, 2000) || null;

    if (!productId) return NextResponse.json({ error: "Missing product." }, { status: 400 });
    if (!Number.isFinite(rating) || rating < 1 || rating > 5)
      return NextResponse.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });

    // verified purchase: find an order_item for this buyer + product
    const { data: purchased } = await admin
      .from("order_items")
      .select("order_id, orders!inner(buyer_id)")
      .eq("product_id", productId)
      .eq("orders.buyer_id", user.id)
      .limit(1);

    if (!purchased || purchased.length === 0)
      return NextResponse.json(
        { error: "Only buyers who have purchased this product can review it." },
        { status: 403 }
      );

    // one review per buyer per product
    const { data: existing } = await admin
      .from("reviews")
      .select("id")
      .eq("product_id", productId)
      .eq("buyer_id", user.id)
      .limit(1);
    if (existing && existing.length > 0)
      return NextResponse.json(
        { error: "You've already reviewed this product." },
        { status: 409 }
      );

    const orderId = (purchased[0] as any).order_id || null;

    const { error: insErr } = await admin.from("reviews").insert({
      product_id: productId,
      buyer_id: user.id,
      order_id: orderId,
      rating,
      title,
      body: text,
      is_verified: true,
      is_approved: false, // held for admin approval
    });
    if (insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, pending: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
