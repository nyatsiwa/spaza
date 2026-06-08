import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  createAdminClient,
} from "@/lib/supabase-server";

/**
 * POST /api/seller/upload   (multipart/form-data, field "file")
 * -> { url, path }
 *
 * Uploads a product image to the public `product-image` bucket using the admin
 * (service-role) client, so it works without storage RLS policies. The bucket
 * is public, so the returned URL is directly usable on the storefront.
 * Only authenticated sellers may upload. Image-only, 5 MB cap.
 */

const BUCKET = "product-image";
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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
    .select("id, status")
    .eq("user_id", user.id)
    .maybeSingle();

  return { admin, user, seller };
}

export async function POST(req: Request) {
  try {
    const { admin, user, seller } = await resolveSeller(req);
    if (!user)
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!seller)
      return NextResponse.json({ error: "not_a_seller" }, { status: 403 });

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string")
      return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const f = file as File;
    if (!f.type.startsWith("image/"))
      return NextResponse.json(
        { error: "Only image files are allowed." },
        { status: 400 }
      );
    if (f.size > MAX_BYTES)
      return NextResponse.json(
        { error: "Image must be 5 MB or smaller." },
        { status: 400 }
      );

    const ext = EXT_BY_TYPE[f.type] || "jpg";
    const path = `${seller.id}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const bytes = new Uint8Array(await f.arrayBuffer());

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: f.type, upsert: false });
    if (upErr)
      return NextResponse.json(
        { error: `Upload failed: ${upErr.message}` },
        { status: 500 }
      );

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl, path });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
