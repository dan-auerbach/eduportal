import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await getCurrentUser();
    const ctx = await getTenantContext();

    const sectionId = request.nextUrl.searchParams.get("sectionId");
    if (!sectionId) {
      return NextResponse.json({ error: "Missing sectionId" }, { status: 400 });
    }

    const section = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      select: {
        videoBlobUrl: true,
        videoSourceType: true,
        videoMimeType: true,
        videoFileName: true,
      },
    });

    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    if (section.videoSourceType !== "UPLOAD" || !section.videoBlobUrl) {
      return NextResponse.json(
        { error: "No uploaded video for this section" },
        { status: 404 }
      );
    }

    // For public blobs, the URL can be used directly.
    // If we switch to private blobs in the future, we'd generate a signed URL here.
    return NextResponse.json({
      url: section.videoBlobUrl,
      mimeType: section.videoMimeType,
      fileName: section.videoFileName,
    });
  } catch (error) {
    console.error("Video signed URL error:", error);
    return NextResponse.json(
      { error: "Failed to get video URL" },
      { status: 500 }
    );
  }
}
