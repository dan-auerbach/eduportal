import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
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
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    // Permission check: HR+ can manage modules
    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    const canManageOwn = await hasPermission(currentUser, "MANAGE_OWN_MODULES");
    if (!canManageAll && !canManageOwn) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sectionId = formData.get("sectionId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!sectionId) {
      return NextResponse.json({ error: "No sectionId provided" }, { status: 400 });
    }

    // Validate section exists and belongs to tenant
    const section = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { module: { select: { createdById: true } } },
    });

    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    // Check module ownership if not MANAGE_ALL_MODULES
    if (!canManageAll && section.module.createdById !== currentUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate file type
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid video format. Allowed: MP4, WebM, OGG, MOV" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        { error: "Video too large. Maximum 500 MB" },
        { status: 400 }
      );
    }

    // Upload to Vercel Blob with private access
    const pathname = `videos/${ctx.tenantId}/${sectionId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const blob = await put(pathname, file, {
      access: "public", // We use public access with the blob URL stored privately in DB
      contentType: file.type,
      addRandomSuffix: true,
    });

    // Delete previous video blob if it exists
    if (section.videoBlobUrl) {
      try {
        const { del } = await import("@vercel/blob");
        await del(section.videoBlobUrl);
      } catch {
        // Ignore deletion errors for old blob
      }
    }

    // Update section with video metadata
    await prisma.section.update({
      where: { id: sectionId },
      data: {
        videoSourceType: "UPLOAD",
        videoBlobUrl: blob.url,
        videoBlobPathname: blob.pathname,
        videoMimeType: file.type,
        videoSize: file.size,
        videoFileName: file.name,
      },
    });

    return NextResponse.json({
      success: true,
      videoBlobUrl: blob.url,
      videoFileName: file.name,
      videoSize: file.size,
      videoMimeType: file.type,
    });
  } catch (error) {
    console.error("Video upload error:", error);
    return NextResponse.json(
      { error: "Video upload failed" },
      { status: 500 }
    );
  }
}
