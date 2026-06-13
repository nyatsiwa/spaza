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
 * Free  -> seller goes ACTIVE instantly, an active subscription row is created,
 *          returns { activated: true }. No payment involved.
 * Growth-> seller is created/kept PENDING for Growth; we initialize a Paystack
 *          transaction tied to the Growth PLAN so Paystack sets up the monthly
 *          R70 subscription. Returns { authorizationUrl }. The webhook activates
 *          the seller's Growth plan once the first charge succeeds.
 */

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";
const GROWTH_PLAN_CODE = process.env.PAYSTACK_GROWTH_PLAN_CODE || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan = String(body?.plan || "").toLowerCase();

    if (plan !== "free" && plan !== "growth") {
      return NextResponse.json(
        { error: "Invalid plan. Choose 'free' or 'growth'." },
        { status: 400 }
      );
    }
    const planConfig = SELLER_PLANS[plan] ?? SELLER_PLANS.free;

    // ---- Authenticate (bearer token first, cookie fallback) ----
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

    // ---- Find or create the seller row ----
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
      sellerId = existingSeller.id;
      const update: Record<string, unknown> = { plan, updated_at: now };
      if (plan === "free") {
        update.status = "active";
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

    // ---- FREE: activate subscription immediately ----
    if (plan === "free") {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 100);
      const forever = farFuture.toISOString();

      const subData: Record<string, unknown> = {
        seller_id: sellerId,
        plan: "free",
        status: "active",
        amount_cents: 0,
        current_period_start: now,
        current_period_end: forever,
        next_billing_date: forever,
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

      return NextResponse.json({ activated: true, plan: "free", sellerId });
    }

    // ---- GROWTH: start Paystack subscription via plan-linked transaction ----
    if (!PAYSTACK_SECRET) {
      return NextResponse.json(
        { error: "Payments are not configured (PAYSTACK_SECRET_KEY missing)." },
        { status: 500 }
      );
    }
    if (!GROWTH_PLAN_CODE) {
      return NextResponse.json(
        { error: "Growth plan is not configured yet (PAYSTACK_GROWTH_PLAN_CODE missing). Please try again later." },
        { status: 503 }
      );
    }
    if (!user.email) {
      return NextResponse.json(
        { error: "Your account has no email address for billing." },
        { status: 400 }
      );
    }

    // Unique reference for this subscription sign-up.
    const ref = `SUBGROWTH-${sellerId.slice(0, 8)}-${Date.now().toString(36)}`;

    // Initializing a transaction WITH a plan code makes Paystack set up the
    // recurring subscription automatically once the customer pays. The plan's
    // amount overrides any amount we pass.
    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        plan: GROWTH_PLAN_CODE,
        reference: ref,
        callback_url: `${APP_URL}/seller/dashboard?growth=activating`,
        metadata: {
          type: "growth_subscription",
          seller_id: sellerId,
          user_id: user.id,
        },
      }),
    });
    const initJson = await initRes.json().catch(() => ({} as any));
    if (!initRes.ok || !initJson?.status || !initJson?.data?.authorization_url) {
      return NextResponse.json(
        { error: initJson?.message || "Could not start the Growth subscription.", detail: initJson },
        { status: 502 }
      );
    }

    // Record a pending subscription row so we have something to reconcile.
    const { data: existingSub } = await admin
      .from("seller_subscriptions")
      .select("id")
      .eq("seller_id", sellerId)
      .maybeSingle();

    const pendingSub: Record<string, unknown> = {
      seller_id: sellerId,
      plan: "growth",
      status: "pending",
      amount_cents: 7000,
      paystack_reference: ref,
      updated_at: now,
    };
    if (existingSub) {
      await admin.from("seller_subscriptions").update(pendingSub).eq("id", existingSub.id);
    } else {
      // include NOT NULL period columns with near-term sentinels; webhook fills real values
      pendingSub.current_period_start = now;
      pendingSub.current_period_end = now;
      pendingSub.next_billing_date = now;
      await admin.from("seller_subscriptions").insert(pendingSub);
    }

    return NextResponse.json({
      authorizationUrl: initJson.data.authorization_url,
      reference: ref,
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
