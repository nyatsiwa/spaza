import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * GET   /api/seller/products  -> { seller, products, limits }
 * POST  /api/seller/products  -> create a product            -> { product }
 * PATCH /api/seller/products  -> edit price/base/stock/status -> { product }
 *
 * Uses the admin client so RLS can't block a verified seller from working with
 * their OWN products. Ownership is enforced by matching seller_id on every
 * read/write (the seller row is resolved from the authenticated user id).
 *
 * Pricing model:
 *   price_cents          = selling price (what the buyer pays)
 *   compare_price_cents  = base / "was" price (struck-through on storefront)
 *   discount %           = derived from the two, never stored
 */

const PLAN_LIMITS: Record<string, { products: number; photos: number }> = {
  free: { products: 5, photos: 2 },
  growth: { products: 10, photos: 3 },
};

const PRODUCT_FIELDS =
  "id, name, price_cents, compare_price_cents, stock_qty, status, images, rejection_reason, created_at";

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

/** Parse an optional Rand amount. Returns undefined if blank, null-meaning. */
function parseOptionalRands(v: unknown): number | null | "invalid" {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "invalid";
  return Math.round(n * 100);
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
      .select(PRODUCT_FIELDS)
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false });
    if (prodErr)
      return NextResponse.json({ error: prodErr.message }, { status: 500 });

    const limits = PLAN_LIMITS[seller.plan] ?? PLAN_LIMITS.free;
    return NextResponse.json({ seller, products: products ?? [], limits });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
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

    if (!name)
      return NextResponse.json({ error: "Product name is required." }, { status: 400 });
    if (!Number.isFinite(priceRands) || priceRands <= 0)
      return NextResponse.json({ error: "Enter a valid selling price greater than 0." }, { status: 400 });
    if (images.length > limits.photos)
      return NextResponse.json(
        { error: `Your ${seller.plan} plan allows up to ${limits.photos} photos per product.` },
        { status: 400 }
      );

    const price_cents = Math.round(priceRands * 100);

    // optional base price
    const baseParsed = parseOptionalRands(body?.baseRands);
    if (baseParsed === "invalid")
      return NextResponse.json({ error: "Enter a valid base price or leave it blank." }, { status: 400 });
    let compare_price_cents: number | null = baseParsed;
    if (compare_price_cents !== null && compare_price_cents <= price_cents)
      return NextResponse.json(
        { error: "Base price must be higher than the selling price (or leave it blank)." },
        { status: 400 }
      );

    // enforce product-count limit
    const { count, error: cntErr } = await admin
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", seller.id);
    if (cntErr)
      return NextResponse.json({ error: cntErr.message }, { status: 500 });
    if ((count ?? 0) >= limits.products)
      return NextResponse.json(
        { error: `Your ${seller.plan} plan allows up to ${limits.products} products. Upgrade to list more.` },
        { status: 400 }
      );

    const now = new Date().toISOString();
    const slug = `${slugify(name) || "product"}-${Math.random().toString(36).slice(2, 7)}`;

    const insert: Record<string, unknown> = {
      seller_id: seller.id,
      name,
      slug,
      price_cents,
      compare_price_cents,
      stock_qty: stockQty,
      images,
      status: "pending", // awaits admin approval before going live
      updated_at: now,
    };
    if (description) insert.description = description;

    const { data: created, error: insErr } = await admin
      .from("products")
      .insert(insert)
      .select(PRODUCT_FIELDS)
      .single();
    if (insErr || !created)
      return NextResponse.json(
        { error: `Could not create product: ${insErr?.message}` },
        { status: 500 }
      );

    return NextResponse.json({ product: created });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id)
      return NextResponse.json({ error: "Missing product id." }, { status: 400 });

    // selling price (required)
    const sellingRands = Number(body?.sellingRands);
    if (!Number.isFinite(sellingRands) || sellingRands <= 0)
      return NextResponse.json({ error: "Enter a valid selling price." }, { status: 400 });
    const price_cents = Math.round(sellingRands * 100);

    // base price (optional; blank clears it)
    const baseParsed = parseOptionalRands(body?.baseRands);
    if (baseParsed === "invalid")
      return NextResponse.json({ error: "Enter a valid base price or leave it blank." }, { status: 400 });
    let compare_price_cents: number | null = baseParsed;
    if (compare_price_cents !== null && compare_price_cents <= price_cents)
      return NextResponse.json(
        { error: "Base price must be higher than the selling price (or leave it blank)." },
        { status: 400 }
      );

    const stockQty = Number.isFinite(Number(body?.stockQty))
      ? Math.max(0, Math.floor(Number(body.stockQty)))
      : 0;

    // Decide the new status. Sellers may toggle visible/hidden on products that
    // are already APPROVED (active / draft / out_of_stock), but they cannot
    // self-approve a product that is pending or rejected — only an admin can
    // move those to active.
    const { data: cur } = await admin
      .from("products")
      .select("status")
      .eq("id", id)
      .eq("seller_id", seller.id)
      .maybeSingle();
    if (!cur)
      return NextResponse.json({ error: "Product not found." }, { status: 404 });

    let status: string = cur.status;
    if (cur.status === "active" || cur.status === "draft" || cur.status === "out_of_stock") {
      status = body?.status === "draft" ? "draft" : "active";
    }
    // pending / rejected: status left unchanged (no self-approval)

    const { data: updated, error: updErr } = await admin
      .from("products")
      .update({
        price_cents,
        compare_price_cents,
        stock_qty: stockQty,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("seller_id", seller.id) // ownership guard
      .select(PRODUCT_FIELDS)
      .single();
    if (updErr || !updated)
      return NextResponse.json(
        { error: `Could not update product: ${updErr?.message || "not found"}` },
        { status: 500 }
      );

    return NextResponse.json({ product: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
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
