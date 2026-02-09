/**
 * Video upload token handler.
 *
 * POST — generates a client token for direct browser-to-Blob upload.
 * This avoids the 4.5MB serverless function payload limit entirely.
 *
 * Flow:
 *   1. Client POSTs { sectionId } to get a scoped upload token
 *   2. Client uses put() from @vercel/blob/client with that token
 *   3. Client calls saveVideoMetadata server action with the result
 */
import { NextRequest, NextResponse } from "next/server";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MAX_VIDEO_SIZE = 10 * 1024 * 1024; // 10 MB (temporarily limited)
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];

export async function POST(request: NextRequest) {
  try {
    const { sectionId, fileName } = await request.json();

    if (!sectionId) {
      return NextResponse.json({ error: "No sectionId provided" }, { status: 400 });
    }

    // Authenticate
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    // Authorize
    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    const canManageOwn = await hasPermission(currentUser, "MANAGE_OWN_MODULES");
    if (!canManageAll && !canManageOwn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate section
    const section = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { module: { select: { createdById: true } } },
    });

    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    if (!canManageAll && section.module.createdById !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Generate scoped client token
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "Blob storage not configured" }, { status: 500 });
    }

    // Sanitize filename and build pathname
    const safeName = (fileName || "video")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 100);
    const pathname = `videos/${ctx.tenantId}/${sectionId}/${Date.now()}-${safeName}`;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      allowedContentTypes: ALLOWED_VIDEO_TYPES,
      maximumSizeInBytes: MAX_VIDEO_SIZE,
      validUntil: Date.now() + 30 * 60 * 1000, // 30 minutes
      addRandomSuffix: true,
    });

    return NextResponse.json({ clientToken, pathname });
  } catch (error) {
    console.error("Video upload token error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate upload token" },
      { status: 500 }
    );
  }
}
