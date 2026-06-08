import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * GET  /api/seller/products  -> { seller, products, limits }
 * POST /api/seller/products  -> create a product (returns { product })
 *
 * Uses the admin client so row-level security can't block a verified seller
 * from reading/writing their OWN products. Ownership is established by looking
 * up the seller row via the authenticated user's id (bearer token, same
 * pattern as checkout/subscribe).
 */

const PLAN_LIMITS: Record<string, { products: number; photos: number }> = {
  free: { products: 5, photos: 2 },
  growth: { products: 10, photos: 3 },
};

async function resolveSeller(req: Request) {
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
  if (!user) return { admin, user: null, seller: null as any };

  const { data: seller } = await admin
    .from("sellers")
    .select("id, store_name, plan, status")
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

    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, name, price_cents, stock_qty, status, images, created_at")
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false });
    if (prodErr)
      return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const limits = PLAN_LIMITS[seller.plan] ?? PLAN_LIMITS.free;
    return NextResponse.json({ seller, products: products ?? [], limits });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });
    if (seller.status !== "active")
      return NextResponse.json(
        { error: "Your seller account isn't active yet." },
        { status: 403 }
      );

    const body = await req.json().catch(() => ({}));
    const name = String(body?.name || "").trim();
    const priceRands = Number(body?.priceRands);
    const description =
      typeof body?.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;
    const stockQty = Number.isFinite(Number(body?.stockQty))
      ? Math.max(0, Math.floor(Number(body.stockQty)))
      : 0;
    const images: string[] = Array.isArray(body?.images)
      ? body.images.map((u: any) => String(u).trim()).filter(Boolean)
      : [];

    const limits = PLAN_LIMITS[seller.plan] ?? PLAN_LIMITS.free;

    // ---- validate input ----
    if (!name)
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    if (!Number.isFinite(priceRands) || priceRands <= 0)
      return NextResponse.json(
        { error: "Enter a valid price greater than 0." },
        { status: 400 }
      );
    if (images.length > limits.photos)
      return NextResponse.json(
        {
          error: `Your ${seller.plan} plan allows up to ${limits.photos} photos per product.`,
        },
        { status: 400 }
      );

    // ---- enforce product-count limit ----
    const { count, error: cntErr } = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", seller.id);
    if (cntErr)
      return NextResponse.json({ error: cntErr.message }, { status: 500 });
    if ((count ?? 0) >= limits.products)
      return NextResponse.json(
        {
          error: `Your ${seller.plan} plan allows up to ${limits.products} products. Upgrade to list more.`,
        },
        { status: 400 }
      );

    const price_cents = Math.round(priceRands * 100);
    const now = new Date().toISOString();
    const slug = `${slugify(name) || "product"}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    const insert: Record<string, unknown> = {
      seller_id: seller.id,
      name,
      slug,
      price_cents,
      stock_qty: stockQty,
      images,
      status: "active", // storefront shows status=active
      published_at: now,
      updated_at: now,
    };
    if (description) insert.description = description;

    const { data: created, error: insErr } = await admin
      .from("products")
      .insert(insert)
      .select("id, name, price_cents, stock_qty, status, images, created_at")
      .single();
    if (insErr || !created)
      return NextResponse.json(
        { error: `Could not create product: ${insErr?.message}` },
        { status: 500 }
      );

    return NextResponse.json({ product: created });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);
}
