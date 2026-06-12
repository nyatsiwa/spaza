import { NextResponse } from "next/server";

/**
 * GET /api/paystack/banks -> { banks: [{ name, code }] }
 * Server-side proxy to Paystack's List Banks endpoint (keeps the secret key
 * off the client). Returns South African banks for the seller banking dropdown.
 */

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || "";

export async function GET() {
  try {
    if (!PAYSTACK_SECRET)
      return NextResponse.json(
        { error: "Payments not configured. Add PAYSTACK_SECRET_KEY in Vercel." },
        { status: 500 }
      );

    const res = await fetch(
      "https://api.paystack.co/bank?country=south africa&currency=ZAR&perPage=100",
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
        // banks rarely change; let the platform cache for an hour
        next: { revalidate: 3600 },
      }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.status)
      return NextResponse.json(
        { error: json?.message || "Could not load banks." },
        { status: 502 }
      );

    const banks = (json.data || [])
      .map((b: any) => ({ name: b.name, code: b.code }))
      .filter((b: any) => b.name && b.code)
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return NextResponse.json({ banks });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
