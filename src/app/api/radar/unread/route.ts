import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";

/**
 * GET /api/radar/unread
 * Returns count of approved radar posts since the user last visited /radar.
 * Used by the sidebar badge for unread count polling.
 */
export async function GET() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ count: 0 });
    }
    return NextResponse.json({ count: 0 });
  }

  try {
    // Get user's last seen timestamp
    const seen = await prisma.radarSeen.findUnique({
      where: {
        userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId },
      },
      select: { lastSeenAt: true },
    });

    // Count approved posts since lastSeenAt (or all if never visited)
    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      status: "APPROVED",
    };

    if (seen?.lastSeenAt) {
      where.approvedAt = { gt: seen.lastSeenAt };
    }

    const count = await prisma.mentorRadarPost.count({ where });

    return NextResponse.json({ count: Math.min(count, 99) });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
