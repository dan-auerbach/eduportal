import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { rateLimitChatPoll } from "@/lib/rate-limit";

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

  // C7/C8: Rate limit polling requests
  const pollRl = await rateLimitChatPoll(ctx.user.id);
  if (!pollRl.success) {
    return NextResponse.json({ count: 0 });
  }

  const afterId = req.nextUrl.searchParams.get("after");

  try {
    // C4: Only count global chat messages (moduleId=null), not module-specific ones
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, moduleId: null };

    // If user has a lastRead marker, count only newer messages.
    // If no marker (never opened chat), count ALL messages so the badge shows up.
    if (afterId) {
      where.id = { gt: afterId };
    }

    const count = await prisma.chatMessage.count({ where });

    return NextResponse.json({ count: Math.min(count, 99) });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
