import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getStreamVideoStatus } from "@/lib/cloudflare-stream";

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
        cloudflareStreamUid: true,
        videoStatus: true,
      },
    });

    if (!section || !section.cloudflareStreamUid) {
      return NextResponse.json({ error: "No stream video found" }, { status: 404 });
    }

    // If already cached as READY, return immediately
    if (section.videoStatus === "READY") {
      return NextResponse.json({ status: "READY" });
    }

    // If ERROR, return immediately
    if (section.videoStatus === "ERROR") {
      return NextResponse.json({ status: "ERROR" });
    }

    // Poll Cloudflare API
    const { ready, error } = await getStreamVideoStatus(section.cloudflareStreamUid);

    if (error) {
      await prisma.section.update({
        where: { id: sectionId },
        data: { videoStatus: "ERROR" },
      });
      return NextResponse.json({ status: "ERROR" });
    }

    if (ready) {
      await prisma.section.update({
        where: { id: sectionId },
        data: { videoStatus: "READY" },
      });
      return NextResponse.json({ status: "READY" });
    }

    return NextResponse.json({ status: "PENDING" });
  } catch (error) {
    console.error("Video status check error:", error);
    return NextResponse.json(
      { error: "Failed to check video status" },
      { status: 500 }
    );
  }
}
