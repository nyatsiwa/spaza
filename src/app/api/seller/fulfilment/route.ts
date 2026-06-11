import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/seller/fulfilment   body: { orderItemId, length, width, height, weight }
 *   -> saves parcel dims/weight, creates a Courier Guy waybill, marks ready.
 *
 * GET  /api/seller/fulfilment?orderItemId=...   -> { labelUrl } (fresh, 24h link)
 *
 * Guards: the seller must own the line item AND the parent order must be `paid`.
 * Uses The Courier Guy / Shiplogic API:
 *   POST {BASE}/rates       -> pick cheapest service level
 *   POST {BASE}/shipments   -> create waybill, returns short_tracking_reference + id
 *   GET  {BASE}/shipments/label?id=...  -> signed PDF URL (expires 24h)
 */

const BASE = process.env.COURIERGUY_BASE_URL || "https://api.shiplogic.com";
const KEY = process.env.COURIERGUY_API_KEY || "";

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
    .select(
      "id, store_name, pickup_street, pickup_local_area, pickup_city, pickup_zone, pickup_code, pickup_company, pickup_contact_name, pickup_contact_mobile"
    )
    .eq("user_id", user.id)
    .maybeSingle();
  return { admin, user, seller };
}

function cg(path: string) {
  return `${BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

// fetch the line item + its order, ensuring the seller owns it
async function loadItem(admin: any, orderItemId: string, sellerId: string) {
  const { data: item } = await admin
    .from("order_items")
    .select(
      "id, seller_id, product_name, quantity, length_cm, width_cm, height_cm, weight_kg, tracking_number, ready_at, " +
        "orders(id, status, shipping_name, shipping_phone, shipping_line1, shipping_line2, shipping_city, shipping_province, shipping_postal)"
    )
    .eq("id", orderItemId)
    .eq("seller_id", sellerId)
    .maybeSingle();
  return item;
}

export async function POST(req: Request) {
  try {
    if (!KEY)
      return NextResponse.json(
        { error: "Courier not configured. Add COURIERGUY_API_KEY in Vercel." },
        { status: 500 }
      );

    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });

    // pickup address must be complete
    if (
      !seller.pickup_street ||
      !seller.pickup_city ||
      !seller.pickup_zone ||
      !seller.pickup_code ||
      !seller.pickup_contact_name ||
      !seller.pickup_contact_mobile
    )
      return NextResponse.json({ error: "no_pickup_address" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const orderItemId = String(body?.orderItemId || "").trim();
    const length = Number(body?.length);
    const width = Number(body?.width);
    const height = Number(body?.height);
    const weight = Number(body?.weight);

    if (!orderItemId)
      return NextResponse.json({ error: "Missing line item." }, { status: 400 });
    for (const [n, v] of [["length", length], ["width", width], ["height", height], ["weight", weight]] as const) {
      if (!Number.isFinite(v) || v <= 0)
        return NextResponse.json({ error: `Enter a valid ${n}.` }, { status: 400 });
    }

    const item = await loadItem(admin, orderItemId, seller.id);
    if (!item)
      return NextResponse.json({ error: "Line item not found." }, { status: 404 });
    const order = (item as any).orders;
    if (!order)
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (order.status !== "paid")
      return NextResponse.json({ error: "order_not_paid" }, { status: 409 });
    if (item.tracking_number)
      return NextResponse.json(
        { error: "A waybill already exists for this item." },
        { status: 409 }
      );

    // persist dims/weight first
    await admin
      .from("order_items")
      .update({ length_cm: length, width_cm: width, height_cm: height, weight_kg: weight })
      .eq("id", item.id);

    const collection_address = {
      type: "business",
      company: seller.pickup_company || seller.store_name || "",
      street_address: seller.pickup_street,
      local_area: seller.pickup_local_area || "",
      city: seller.pickup_city,
      zone: seller.pickup_zone,
      country: "ZA",
      code: seller.pickup_code,
    };
    const delivery_address = {
      type: "residential",
      company: "",
      street_address: [order.shipping_line1, order.shipping_line2].filter(Boolean).join(", "),
      local_area: order.shipping_line2 || "",
      city: order.shipping_city,
      zone: order.shipping_province,
      country: "ZA",
      code: order.shipping_postal,
    };
    const parcels = [
      {
        parcel_description: item.product_name || "Parcel",
        submitted_length_cm: length,
        submitted_width_cm: width,
        submitted_height_cm: height,
        submitted_weight_kg: weight,
      },
    ];

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    };

    // 1) rates -> cheapest service level
    const ratesUrl = cg("rates");
    let ratesRes: Response;
    let ratesText = "";
    let ratesJson: any = {};
    try {
      ratesRes = await fetch(ratesUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ collection_address, delivery_address, parcels }),
      });
    } catch (fe: any) {
      // network-level failure (bad host, DNS, etc.)
      return NextResponse.json(
        {
          error: "Could not reach the courier.",
          diagnostic: {
            stage: "rates_fetch_threw",
            url: ratesUrl,
            base_url_env: BASE,
            key_present: !!KEY,
            message: fe?.message || String(fe),
          },
        },
        { status: 502 }
      );
    }
    ratesText = await ratesRes.text().catch(() => "");
    try {
      ratesJson = ratesText ? JSON.parse(ratesText) : {};
    } catch {
      ratesJson = {};
    }
    if (!ratesRes.ok) {
      return NextResponse.json(
        {
          error: "Could not get courier rates.",
          diagnostic: {
            stage: "rates_response_not_ok",
            url: ratesUrl,
            base_url_env: BASE,
            key_present: !!KEY,
            status: ratesRes.status,
            statusText: ratesRes.statusText,
            // first 600 chars of whatever the courier returned (JSON or HTML)
            body: ratesText.slice(0, 600),
          },
        },
        { status: 502 }
      );
    }
    const rateList: any[] = ratesJson?.rates || ratesJson?.data || [];
    if (!rateList.length)
      return NextResponse.json(
        {
          error: "No courier rates available for this route.",
          diagnostic: {
            stage: "rates_empty",
            url: ratesUrl,
            status: ratesRes.status,
            body: ratesText.slice(0, 600),
          },
        },
        { status: 502 }
      );
    const cheapest = rateList
      .filter((r) => r?.service_level)
      .sort(
        (a, b) =>
          (a.rate ?? a.total ?? a.charged_amount ?? Infinity) -
          (b.rate ?? b.total ?? b.charged_amount ?? Infinity)
      )[0] || rateList[0];
    const serviceLevelCode =
      cheapest?.service_level?.code || cheapest?.service_level_code || "ECO";

    // 2) create shipment (waybill)
    const shipRes = await fetch(cg("shipments"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        collection_address,
        collection_contact: {
          name: seller.pickup_contact_name,
          mobile_number: seller.pickup_contact_mobile,
          email: "",
        },
        delivery_address,
        delivery_contact: {
          name: order.shipping_name || "",
          mobile_number: order.shipping_phone || "",
          email: "",
        },
        parcels,
        service_level_code: serviceLevelCode,
        customer_reference_name: "Order item",
        customer_reference: String(item.id).slice(0, 8),
        mute_notifications: false,
      }),
    });
    const shipJson = await shipRes.json().catch(() => ({}));
    if (!shipRes.ok)
      return NextResponse.json(
        { error: shipJson?.message || "Could not create waybill.", detail: shipJson },
        { status: 502 }
      );

    const shipmentId = shipJson?.id || shipJson?.shipment?.id;
    const tracking =
      shipJson?.short_tracking_reference ||
      shipJson?.custom_tracking_reference ||
      shipJson?.shipment?.short_tracking_reference ||
      "";

    // 3) label PDF (signed, 24h)
    let labelUrl = "";
    if (shipmentId) {
      const labelRes = await fetch(cg(`shipments/label?id=${shipmentId}`), {
        method: "GET",
        headers: { Authorization: `Bearer ${KEY}` },
      });
      const labelJson = await labelRes.json().catch(() => ({}));
      labelUrl = labelJson?.url || labelJson?.label_url || "";
    }

    // persist tracking + ready_at
    await admin
      .from("order_items")
      .update({
        tracking_number: tracking,
        ready_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    return NextResponse.json({
      ok: true,
      tracking,
      shipmentId,
      serviceLevelCode,
      labelUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// re-fetch a fresh (24h) label URL for an already-created waybill
export async function GET(req: Request) {
  try {
    if (!KEY)
      return NextResponse.json({ error: "Courier not configured." }, { status: 500 });
    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });

    const url = new URL(req.url);
    const orderItemId = String(url.searchParams.get("orderItemId") || "").trim();
    if (!orderItemId)
      return NextResponse.json({ error: "Missing line item." }, { status: 400 });

    const item = await loadItem(admin, orderItemId, seller.id);
    if (!item || !item.tracking_number)
      return NextResponse.json({ error: "No waybill for this item." }, { status: 404 });

    // find the shipment by tracking reference to get its id
    const shipRes = await fetch(
      cg(`shipments?tracking_reference=${encodeURIComponent(item.tracking_number)}`),
      { headers: { Authorization: `Bearer ${KEY}` } }
    );
    const shipJson = await shipRes.json().catch(() => ({}));
    const list: any[] = shipJson?.shipments || shipJson?.data || (Array.isArray(shipJson) ? shipJson : []);
    const shipmentId = list?.[0]?.id || shipJson?.id;
    if (!shipmentId)
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

    const labelRes = await fetch(cg(`shipments/label?id=${shipmentId}`), {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const labelJson = await labelRes.json().catch(() => ({}));
    const labelUrl = labelJson?.url || labelJson?.label_url || "";
    if (!labelUrl)
      return NextResponse.json({ error: "Could not fetch label." }, { status: 502 });

    return NextResponse.json({ ok: true, labelUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
