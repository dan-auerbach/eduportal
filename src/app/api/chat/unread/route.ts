import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";

/**
 * GET /api/chat/unread?after=<lastReadMessageId>
 * Returns count of messages after the given ID for the current tenant.
 * Used by the sidebar badge for unread count polling.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ count: 0 });
    }
    return NextResponse.json({ count: 0 });
  }

  const afterId = req.nextUrl.searchParams.get("after");

  // If no lastRead marker, return 0 (don't scare new users)
  if (!afterId) {
    return NextResponse.json({ count: 0 });
  }

  try {
    const count = await prisma.chatMessage.count({
      where: {
        tenantId: ctx.tenantId,
        id: { gt: afterId },
      },
    });

    return NextResponse.json({ count: Math.min(count, 99) });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
