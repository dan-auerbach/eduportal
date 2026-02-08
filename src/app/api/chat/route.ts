import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";

const MAX_FETCH = 200;

/**
 * GET /api/chat?after=<lastMessageId>
 * Lightweight polling endpoint for new chat messages.
 * Also returns the current channel topic.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const afterId = req.nextUrl.searchParams.get("after") ?? undefined;

  const where: Record<string, unknown> = { tenantId: ctx.tenantId };
  if (afterId) {
    where.id = { gt: afterId };
  }

  const [messages, tenant] = await Promise.all([
    prisma.chatMessage.findMany({
      where,
      orderBy: afterId ? { id: "asc" } : { createdAt: "desc" },
      take: MAX_FETCH,
      select: {
        id: true,
        type: true,
        displayName: true,
        body: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { chatTopic: true },
    }),
  ]);

  // Initial load: reverse so oldest first
  const sorted = afterId ? messages : messages.reverse();

  return NextResponse.json({
    messages: sorted.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
    tenantSlug: ctx.tenantSlug,
    topic: tenant?.chatTopic ?? null,
  });
}
