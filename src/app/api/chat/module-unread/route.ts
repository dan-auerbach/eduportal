import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { checkModuleAccess } from "@/lib/permissions";

/**
 * GET /api/chat/module-unread?moduleId=<id>&after=<lastReadMessageId>
 * Returns count of unread messages for a specific module channel.
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

  const moduleId = req.nextUrl.searchParams.get("moduleId");
  const afterId = req.nextUrl.searchParams.get("after");

  if (!moduleId) {
    return NextResponse.json({ count: 0 });
  }

  try {
    // C3: Verify user has access to this module
    const hasAccess = await checkModuleAccess(ctx.user.id, moduleId, ctx.tenantId);
    if (!hasAccess) {
      return NextResponse.json({ count: 0 });
    }

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      moduleId,
    };

    if (afterId) {
      where.id = { gt: afterId };
    }

    const count = await prisma.chatMessage.count({ where });

    return NextResponse.json({ count: Math.min(count, 99) });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
