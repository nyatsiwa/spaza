import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/seller/account   -> save payout (banking) details
 *   body: { bankName, accountNumber, branchCode, accountType }
 *
 * Writes to the seller's own row via the admin client (ownership resolved from
 * the authenticated user). All four fields are required.
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

const ACCOUNT_TYPES = ["cheque", "savings", "transmission", "business"];

export async function POST(req: Request) {
  try {
    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const bankName = String(body?.bankName || "").trim();
    const accountNumber = String(body?.accountNumber || "").trim();
    const branchCode = String(body?.branchCode || "").trim();
    const accountType = String(body?.accountType || "").trim().toLowerCase();

    if (!bankName || !accountNumber || !branchCode || !accountType)
      return NextResponse.json(
        { error: "All payout fields are required." },
        { status: 400 }
      );
    if (!/^\d{4,20}$/.test(accountNumber.replace(/\s/g, "")))
      return NextResponse.json(
        { error: "Enter a valid account number (digits only)." },
        { status: 400 }
      );
    if (!/^\d{4,8}$/.test(branchCode.replace(/\s/g, "")))
      return NextResponse.json(
        { error: "Enter a valid branch code." },
        { status: 400 }
      );
    if (!ACCOUNT_TYPES.includes(accountType))
      return NextResponse.json(
        { error: "Choose a valid account type." },
        { status: 400 }
      );

    const { error } = await admin
      .from("sellers")
      .update({
        bank_name: bankName,
        bank_account_number: accountNumber.replace(/\s/g, ""),
        bank_branch_code: branchCode.replace(/\s/g, ""),
        bank_account_type: accountType,
        updated_at: new Date().toISOString(),
      })
      .eq("id", seller.id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      banking: {
        bank_name: bankName,
        bank_account_number: accountNumber.replace(/\s/g, ""),
        bank_branch_code: branchCode.replace(/\s/g, ""),
        bank_account_type: accountType,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
