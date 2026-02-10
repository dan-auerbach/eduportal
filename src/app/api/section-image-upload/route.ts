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
import sharp from "sharp";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const IMAGE_TARGET_SIZE = 75 * 1024; // 75 KB target after compression
const IMAGE_MAX_WIDTH = 1200; // max width in pixels
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
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "Blob storage not configured" },
        { status: 500 }
      );
    }

    // Compress raster images to ≤75KB JPEG; pass SVG through as-is
    const buffer = Buffer.from(await file.arrayBuffer());
    let uploadBuffer: Buffer | File;
    let uploadContentType = file.type;
    let outputExt = file.name.split(".").pop()?.toLowerCase() || "jpg";

    if (file.type !== "image/svg+xml") {
      let img = sharp(buffer).resize({
        width: IMAGE_MAX_WIDTH,
        withoutEnlargement: true,
      });

      let quality = 80;
      let compressed = await img.jpeg({ quality, mozjpeg: true }).toBuffer();

      while (compressed.length > IMAGE_TARGET_SIZE && quality > 20) {
        quality -= 10;
        compressed = await img.jpeg({ quality, mozjpeg: true }).toBuffer();
      }

      uploadBuffer = compressed;
      uploadContentType = "image/jpeg";
      outputExt = "jpg";
    } else {
      uploadBuffer = file;
    }

    const pathname = `section-images/${ctx.tenantId}/${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.${outputExt}`;

    // Upload to Vercel Blob
    const blob = await put(pathname, uploadBuffer, {
      access: "public",
      token,
      addRandomSuffix: true,
      contentType: uploadContentType,
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
