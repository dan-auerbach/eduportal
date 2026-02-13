/**
 * Document upload API route.
 *
 * Accepts FormData with:
 *   - file: PDF/DOC/DOCX (max 20 MB)
 *   - title: optional display title (defaults to filename)
 *
 * Creates a MediaAsset (type=DOCUMENT), uploads to Vercel Blob,
 * and marks the asset as READY.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["OWNER", "SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ctx = await getTenantContext();

  // ── Parse FormData ────────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  const title = (formData.get("title") as string)?.trim() || file.name;

  // ── Validate ──────────────────────────────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Nepodprt format. Uporabite PDF, DOC ali DOCX." },
      { status: 400 },
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Datoteka je prevelika (max 20 MB)." },
      { status: 400 },
    );
  }

  try {
    // ── Create MediaAsset ─────────────────────────────────────────────
    const asset = await prisma.mediaAsset.create({
      data: {
        tenantId: ctx.tenantId,
        createdById: user.id,
        type: "DOCUMENT",
        provider: "VERCEL_BLOB",
        status: "PROCESSING",
        title,
        mimeType: file.type,
        sizeBytes: BigInt(file.size),
      },
    });

    // ── Upload to Vercel Blob ─────────────────────────────────────────
    const { put } = await import("@vercel/blob");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const blobKey = `documents/${asset.id}.${ext}`;

    const blob = await put(blobKey, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });

    // ── Mark as READY ─────────────────────────────────────────────────
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        blobUrl: blob.url,
        status: "READY",
      },
    });

    return NextResponse.json({
      success: true,
      assetId: asset.id,
      title,
    });
  } catch (err) {
    console.error("[document-upload] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
