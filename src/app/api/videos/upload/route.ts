/**
 * Video upload handler — uses Vercel Blob client-side upload pattern.
 *
 * POST with multipart/form-data (handleUpload callback) — called by @vercel/blob/client
 * This is the token-generation endpoint that validates permissions before
 * allowing the client to upload directly to Vercel Blob (bypasses 4.5MB limit).
 */
import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime", // .mov
];

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Authenticate and authorize
        const currentUser = await getCurrentUser();
        const ctx = await getTenantContext();

        const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
        const canManageOwn = await hasPermission(currentUser, "MANAGE_OWN_MODULES");
        if (!canManageAll && !canManageOwn) {
          throw new Error("Forbidden");
        }

        // Validate sectionId from clientPayload
        const sectionId = clientPayload ? JSON.parse(clientPayload).sectionId : null;
        if (!sectionId) {
          throw new Error("No sectionId provided");
        }

        const section = await prisma.section.findUnique({
          where: { id: sectionId, tenantId: ctx.tenantId },
          include: { module: { select: { createdById: true } } },
        });

        if (!section) {
          throw new Error("Section not found");
        }

        if (!canManageAll && section.module.createdById !== currentUser.id) {
          throw new Error("Forbidden");
        }

        return {
          allowedContentTypes: ALLOWED_VIDEO_TYPES,
          maximumSizeInBytes: MAX_VIDEO_SIZE,
          tokenPayload: JSON.stringify({
            sectionId,
            tenantId: ctx.tenantId,
            userId: currentUser.id,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Called by Vercel after the upload completes
        // Save video metadata to the section
        try {
          const payload = JSON.parse(tokenPayload || "{}");
          const { sectionId } = payload;

          if (!sectionId) return;

          // Get existing section to clean up old blob
          const existing = await prisma.section.findUnique({
            where: { id: sectionId },
            select: { videoBlobUrl: true },
          });

          // Delete old blob if replacing
          if (existing?.videoBlobUrl) {
            try {
              const { del } = await import("@vercel/blob");
              await del(existing.videoBlobUrl);
            } catch {
              // Ignore
            }
          }

          // Update section with new video data
          // Note: blob.size is not available in onUploadCompleted callback,
          // the client-side saveVideoMetadata call handles full metadata storage.
          await prisma.section.update({
            where: { id: sectionId },
            data: {
              videoSourceType: "UPLOAD",
              videoBlobUrl: blob.url,
              videoBlobPathname: blob.pathname,
              videoMimeType: blob.contentType,
              videoFileName: blob.pathname.split("/").pop() || "video",
            },
          });
        } catch (error) {
          console.error("onUploadCompleted error:", error);
          // Don't throw - the blob is already uploaded
        }
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    console.error("Video upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video upload failed" },
      { status: 500 }
    );
  }
}
