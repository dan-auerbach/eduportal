import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { createDirectUpload } from "@/lib/cloudflare-stream";

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

    // Create Cloudflare Stream direct upload
    const safeName = (fileName || "video")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 100);

    const { uploadUrl, uid } = await createDirectUpload(safeName);

    // Save UID to DB immediately so we can track this upload
    await prisma.section.update({
      where: { id: sectionId },
      data: {
        videoSourceType: "CLOUDFLARE_STREAM",
        cloudflareStreamUid: uid,
        videoStatus: "PENDING",
      },
    });

    return NextResponse.json({ uploadUrl, uid });
  } catch (error) {
    console.error("CF Stream upload creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create upload" },
      { status: 500 }
    );
  }
}
