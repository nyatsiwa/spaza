import { NextResponse } from "next/server";
import { SELLER_PLANS } from "@/lib/commission";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/seller/subscribe
 *
 * Body: { plan: "free" | "growth", storeName?, storeDescription?, category? }
 *
 * Free   -> seller goes ACTIVE instantly, an active subscription row is
 *           created, returns { activated: true }. No payment involved.
 * Growth -> seller is created/kept PENDING, a Paystack transaction is
 *           initialized against the Growth plan, and the route returns
 *           { authorizationUrl } so the /sell page can redirect the seller
 *           to Paystack's hosted checkout. The seller is only flipped to
 *           ACTIVE when the Paystack webhook confirms the charge.
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
      // Free never bills, but current_period_end / next_billing_date are
      // NOT NULL in the DB. Use a far-future "forever" sentinel so the row
      // satisfies the constraint without implying a real charge (amount is 0
      // and there's no billing token, so no billing job will ever touch it).
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 100);
      const forever = farFuture.toISOString();

      const subData: Record<string, unknown> = {
        seller_id: sellerId,
        plan: "free",
        status: "active",
        amount_cents: 0,
        current_period_start: now,
        current_period_end: forever, // free plan: never expires
        next_billing_date: forever, // free plan: never billed
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

    // ---- 5. GROWTH: initialize a Paystack subscription transaction -------
    // We hand the email + plan code to Paystack's transaction/initialize. When
    // a `plan` is supplied, Paystack derives the amount and currency from the
    // plan and creates a subscription on first successful charge, so we DON'T
    // send amount/currency (sending a conflicting one is a common cause of a
    // rejected initialize). The seller stays PENDING until the webhook
    // confirms the charge; we persist the reference now so the webhook can
    // match this checkout back to the right seller.

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const planCode = process.env.PAYSTACK_GROWTH_PLAN_CODE;
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
      new URL(req.url).origin;

    if (!secretKey) {
      return NextResponse.json(
        {
          error: "Billing is not configured.",
          detail: "PAYSTACK_SECRET_KEY is missing from the environment.",
        },
        { status: 500 }
      );
    }
    if (!planCode) {
      return NextResponse.json(
        {
          error: "Growth plan is not configured.",
          detail: "PAYSTACK_GROWTH_PLAN_CODE is missing from the environment.",
        },
        { status: 500 }
      );
    }

    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { error: "Your account has no email address to bill." },
        { status: 400 }
      );
    }

    // Initialize the Paystack transaction tied to the Growth plan.
    const initRes = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          plan: planCode,
          callback_url: `${appUrl}/seller/dashboard?subscription=growth`,
          metadata: {
            seller_id: sellerId,
            user_id: user.id,
            purpose: "growth_subscription",
          },
        }),
      }
    );

    const initJson: any = await initRes.json().catch(() => null);

    if (
      !initRes.ok ||
      !initJson?.status ||
      !initJson?.data?.authorization_url
    ) {
      // Surface Paystack's own message so the cause is visible (bad key,
      // currency not enabled, plan not found on this integration, etc.).
      return NextResponse.json(
        {
          error: "Could not start the Growth subscription checkout.",
          detail:
            initJson?.message ||
            `Paystack transaction/initialize returned HTTP ${initRes.status}.`,
        },
        { status: 502 }
      );
    }

    const authorizationUrl = initJson.data.authorization_url as string;
    const reference = initJson.data.reference as string;

    // Persist a PENDING growth subscription with the reference so the webhook
    // can match the charge. period_end / next_billing_date are NOT NULL; the
    // webhook overwrites them with real Paystack dates on activation. They're
    // placeholders here and the row is `pending`, so no billing/active check
    // should treat this as a live subscription yet.
    const subData: Record<string, unknown> = {
      seller_id: sellerId,
      plan: "growth",
      status: "pending",
      amount_cents: 7000, // R70.00 — Growth monthly
      paystack_reference: reference,
      current_period_start: now,
      current_period_end: now, // placeholder; webhook sets the real value
      next_billing_date: now, // placeholder; webhook sets the real value
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
      authorizationUrl,
      reference,
      plan: "growth",
      sellerId,
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
