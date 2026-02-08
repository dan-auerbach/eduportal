/**
 * Section image upload endpoint.
 *
 * Accepts an image file (JPG, PNG, GIF, WebP, SVG), uploads it to
 * Vercel Blob storage, and returns the public URL.
 * Used by the rich text editor to embed inline images.
 */
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

export async function POST(req: Request) {
  try {
    // Authenticate
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    // Authorize — need module management permission
    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    const canManageOwn = await hasPermission(currentUser, "MANAGE_OWN_MODULES");
    if (!canManageAll && !canManageOwn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid image type. Allowed: JPG, PNG, GIF, WebP, SVG" },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: "Image too large. Maximum 5 MB." },
        { status: 400 }
      );
    }

    // Build pathname
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const pathname = `section-images/${ctx.tenantId}/${Date.now()}-${safeName}`;

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Blob storage not configured" },
        { status: 500 }
      );
    }

    // Upload to Vercel Blob
    const blob = await put(pathname, file, {
      access: "public",
      token,
      addRandomSuffix: true,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
    });
  } catch (error) {
    console.error("Section image upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
