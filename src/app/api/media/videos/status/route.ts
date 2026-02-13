import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getStreamVideoStatus } from "@/lib/cloudflare-stream";

/**
 * Poll MediaAsset video processing status.
 * Checks Cloudflare Stream API and updates the asset's status.
 */
export async function GET(request: NextRequest) {
  try {
    await getCurrentUser();
    const ctx = await getTenantContext();

    const assetId = request.nextUrl.searchParams.get("assetId");
    if (!assetId) {
      return NextResponse.json({ error: "Missing assetId" }, { status: 400 });
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId, tenantId: ctx.tenantId },
      select: {
        cfStreamUid: true,
        status: true,
      },
    });

    if (!asset || !asset.cfStreamUid) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // If already READY or FAILED, return immediately
    if (asset.status === "READY") {
      return NextResponse.json({ status: "READY" });
    }

    if (asset.status === "FAILED") {
      return NextResponse.json({ status: "FAILED" });
    }

    // Poll Cloudflare Stream API
    const { ready, error } = await getStreamVideoStatus(asset.cfStreamUid);

    if (error) {
      await prisma.mediaAsset.update({
        where: { id: assetId },
        data: { status: "FAILED", lastError: "Cloudflare Stream processing failed" },
      });
      return NextResponse.json({ status: "FAILED" });
    }

    if (ready) {
      await prisma.mediaAsset.update({
        where: { id: assetId },
        data: { status: "READY" },
      });
      return NextResponse.json({ status: "READY" });
    }

    return NextResponse.json({ status: "PROCESSING" });
  } catch (error) {
    console.error("Media status check error:", error);
    return NextResponse.json(
      { error: "Failed to check video status" },
      { status: 500 },
    );
  }
}
