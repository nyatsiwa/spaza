import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/seller/tracking/refresh
 *
 * For the authenticated seller's OPEN waybills (have a tracking_number, parent
 * order not yet delivered/cancelled), ask Shiplogic for the latest tracking
 * status and advance the parent order:
 *   raw status contains "delivered"                         -> order "delivered" (+ delivered_at)
 *   raw contains collected / in transit / out for delivery  -> order "shipped"   (+ shipped_at)
 * Status only ever moves forward. Raw courier statuses are returned in
 * `seen[]` and logged so the mapping can be tightened against real data.
 */

const KEY = process.env.COURIERGUY_API_KEY || "";
const BASE = (process.env.COURIERGUY_BASE_URL || "https://api.shiplogic.com").replace(/\/+$/, "");

function cg(path: string) {
  return `${BASE}/${path.replace(/^\/+/, "")}`;
}

// Map a raw Shiplogic status string to our order status (or null = no change).
// "out for delivery" contains "deliver", so check it before "delivered".
function mapStatusSafe(raw: string): "shipped" | "delivered" | null {
  const s = (raw || "").toLowerCase();
  if (s.includes("out for delivery")) return "shipped";
  if (s.includes("delivered")) return "delivered";
  if (s.includes("collected") || s.includes("in transit") || s.includes("at hub") || s.includes("picked up") || s.includes("collection") || s.includes("transit"))
    return "shipped";
  return null;
}

const RANK: Record<string, number> = { paid: 1, processing: 2, shipped: 3, delivered: 4 };

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

export async function POST(req: Request) {
  try {
    const { admin, user, seller } = await resolveSeller(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller) return NextResponse.json({ error: "not_a_seller" }, { status: 403 });
    if (!KEY) return NextResponse.json({ error: "Courier not configured." }, { status: 500 });

    // Open waybills: have a tracking number, order not already delivered.
    const { data: items, error } = await admin
      .from("order_items")
      .select("id, order_id, tracking_number, orders(id, status)")
      .eq("seller_id", seller.id)
      .not("tracking_number", "is", null)
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const open = (items ?? []).filter((it: any) => {
      const st = it.orders?.status;
      return st && st !== "delivered" && st !== "cancelled" && st !== "refunded";
    });

    const seen: { tracking: string; raw: string; mapped: string | null }[] = [];
    let updated = 0;

    for (const it of open) {
      const tracking = it.tracking_number as string;
      let raw = "";
      try {
        const res = await fetch(cg(`tracking/shipments?tracking_reference=${encodeURIComponent(tracking)}`), {
          headers: { Authorization: `Bearer ${KEY}` },
        });
        const text = await res.text().catch(() => "");
        let json: any = {};
        try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
        // Shiplogic shapes vary; pull the most recent status we can find.
        raw =
          json?.shipments?.[0]?.status ||
          json?.data?.[0]?.status ||
          json?.status ||
          json?.shipments?.[0]?.tracking_events?.slice(-1)?.[0]?.status ||
          json?.tracking_events?.slice(-1)?.[0]?.status ||
          "";
      } catch {
        raw = "";
      }

      const mapped = mapStatusSafe(raw);
      seen.push({ tracking, raw, mapped });
      // log raw so we can refine mapping against real courier data
      console.log("[tracking]", tracking, "raw:", raw, "mapped:", mapped);

      if (mapped) {
        const current = it.orders?.status || "paid";
        // only advance forward
        if ((RANK[mapped] || 0) > (RANK[current] || 0)) {
          const patch: Record<string, unknown> = { status: mapped, updated_at: new Date().toISOString() };
          await admin.from("orders").update(patch).eq("id", it.order_id);
          // stamp the line-item timestamp too
          const stamp = mapped === "delivered" ? { delivered_at: new Date().toISOString() } : { shipped_at: new Date().toISOString() };
          await admin.from("order_items").update(stamp).eq("id", it.id);
          updated++;
        }
      }
    }

    return NextResponse.json({ ok: true, checked: open.length, updated, seen });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
