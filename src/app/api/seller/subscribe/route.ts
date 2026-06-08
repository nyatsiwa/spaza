import { NextResponse } from "next/server";
import { SELLER_PLANS } from "@/lib/payfast";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/seller/subscribe
 *
 * Body: { plan: "free" | "growth", storeName?, storeDescription?, category? }
 *
 * Free  -> seller goes ACTIVE instantly, an active subscription row is created,
 *          returns { activated: true }. No PayFast involved.
 * Growth-> seller is created/kept PENDING, returns { pending: true } for now.
 *          (PayFast recurring billing gets wired here once credentials are
 *          recovered — see the TODO block below.)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase();

    // ---- 1. Validate plan -------------------------------------------------
    if (plan !== "free" && plan !== "growth") {
      return NextResponse.json(
        { error: "Invalid plan. Choose 'free' or 'growth'." },
        { status: 400 }
      );
    }
    const planConfig = SELLER_PLANS[plan] ?? SELLER_PLANS.free;

    // ---- 2. Authenticate the user ----------------------------------------
    // Prefer the bearer token (same pattern as checkout, which is reliable in
    // route handlers); fall back to the cookie session if no token is sent.
    const admin = createAdminClient();

    let user = null as { id: string; email?: string } | null;

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
    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in to become a seller." },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();

    // ---- 3. Find or create the seller row --------------------------------
    const { data: existingSeller, error: sellerLookupErr } = await admin
      .from("sellers")
      .select("id, status, plan, approved_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (sellerLookupErr) {
      return NextResponse.json(
        { error: `Seller lookup failed: ${sellerLookupErr.message}` },
        { status: 500 }
      );
    }

    let sellerId: string;

    if (existingSeller) {
      // Existing seller (e.g. Eden Extract): update plan.
      // Free -> activate. Growth -> leave current status (activates on payment).
      sellerId = existingSeller.id;
      const update: Record<string, unknown> = { plan, updated_at: now };
      if (plan === "free") {
        update.status = "active";
        // Free = auto-approved instantly. Keep an existing approval date if
        // there is one, otherwise stamp it now so the store is visible even if
        // the storefront filters on approved_at.
        update.approved_at = (existingSeller as any).approved_at ?? now;
      }

      const { error: updErr } = await admin
        .from("sellers")
        .update(update)
        .eq("id", sellerId);
      if (updErr) {
        return NextResponse.json(
          { error: `Could not update seller: ${updErr.message}` },
          { status: 500 }
        );
      }
    } else {
      // New seller. We only have a plan choice from /sell, so derive a store
      // name/slug. (A fuller onboarding form can overwrite these later.)
      let profileName: string | null = null;
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      profileName = profile?.full_name ?? null;

      const rawName =
        (typeof body?.storeName === "string" && body.storeName.trim()) ||
        (profileName ? `${profileName}'s Store` : null) ||
        `${(user.email || "seller").split("@")[0]}'s Store`;

      const slugBase = slugify(rawName) || "store";
      const storeSlug = `${slugBase}-${user.id.slice(0, 6)}`;

      const insert: Record<string, unknown> = {
        user_id: user.id,
        store_name: rawName,
        store_slug: storeSlug,
        plan,
        status: plan === "free" ? "active" : "pending",
        approved_at: plan === "free" ? now : null,
        total_sales: 0,
        total_orders: 0,
        review_count: 0,
        updated_at: now,
      };
      if (typeof body?.storeDescription === "string")
        insert.store_description = body.storeDescription.trim();
      if (typeof body?.category === "string")
        insert.category = body.category.trim();

      const { data: created, error: insErr } = await admin
        .from("sellers")
        .insert(insert)
        .select("id")
        .single();
      if (insErr || !created) {
        return NextResponse.json(
          { error: `Could not create seller: ${insErr?.message}` },
          { status: 500 }
        );
      }
      sellerId = created.id;
    }

    // ---- 4. FREE: activate subscription immediately ----------------------
    if (plan === "free") {
      const subData: Record<string, unknown> = {
        seller_id: sellerId,
        plan: "free",
        status: "active",
        amount_cents: 0,
        current_period_start: now,
        current_period_end: null, // free plan: no billing period
        next_billing_date: null, // free plan: never billed
        cancelled_at: null,
        updated_at: now,
      };

      const { data: existingSub } = await admin
        .from("seller_subscriptions")
        .select("id")
        .eq("seller_id", sellerId)
        .maybeSingle();

      if (existingSub) {
        const { error: subUpdErr } = await admin
          .from("seller_subscriptions")
          .update(subData)
          .eq("id", existingSub.id);
        if (subUpdErr) {
          return NextResponse.json(
            { error: `Could not update subscription: ${subUpdErr.message}` },
            { status: 500 }
          );
        }
      } else {
        const { error: subInsErr } = await admin
          .from("seller_subscriptions")
          .insert(subData);
        if (subInsErr) {
          return NextResponse.json(
            { error: `Could not create subscription: ${subInsErr.message}` },
            { status: 500 }
          );
        }
      }

      return NextResponse.json({
        activated: true,
        plan: "free",
        sellerId,
      });
    }

    // ---- 5. GROWTH: gated on PayFast credentials -------------------------
    // The seller now exists (pending). The recurring R70/mo subscription will
    // be created + activated by the ITN handler once payment succeeds.
    //
    // TODO (once PayFast creds are recovered) — replace the response below with:
    //
    //   const { buildSubscriptionPayload } = await import("@/lib/payfast");
    //   const payfast = buildSubscriptionPayload({
    //     sellerId,
    //     amountCents: planConfig.amount_cents,
    //     itemName: `Spaza-Growth-${sellerId.slice(0, 8)}`,
    //     emailAddress: user.email,
    //   });
    //   return NextResponse.json({ payfast });
    //
    return NextResponse.json({
      pending: true,
      plan: "growth",
      sellerId,
      message:
        "Growth plan selected. The R70/month subscription activates once PayFast billing is set up.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Unexpected error: ${err?.message || String(err)}` },
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
    .slice(0, 40);
}
