import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { checkModuleAccess } from "@/lib/permissions";

const MAX_FETCH = 200;

/**
 * GET /api/chat?after=<lastMessageId>&moduleId=<moduleId>
 * Lightweight polling endpoint for new chat messages.
 * Also returns the current channel topic (for global chat) and mentor IDs (for module chat).
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
  const moduleId = req.nextUrl.searchParams.get("moduleId") ?? null;

  // If module chat, verify access
  if (moduleId) {
    try {
      const hasAccess = await checkModuleAccess(ctx.user.id, moduleId, ctx.tenantId);
      if (!hasAccess) {
        return NextResponse.json({ error: "No access" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Access check failed" }, { status: 403 });
    }
  }

  const where: Record<string, unknown> = {
    tenantId: ctx.tenantId,
    moduleId: moduleId ?? null, // null = global chat
  };
  if (afterId) {
    where.id = { gt: afterId };
  }

  // Fetch messages, topic, and mentor IDs in parallel
  const [messages, tenant, mentors] = await Promise.all([
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
        moduleId: true,
        isConfirmedAnswer: true,
        confirmedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    }),
    moduleId
      ? null
      : prisma.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { chatTopic: true },
        }),
    moduleId
      ? prisma.moduleMentor.findMany({
          where: { moduleId },
          select: { userId: true },
        })
      : [],
  ]);

  const mentorIds = mentors.map((m) => m.userId);
  const mentorSet = new Set(mentorIds);

  // Initial load: reverse so oldest first
  const sorted = afterId ? messages : messages.reverse();

  return NextResponse.json({
    messages: sorted.map((m) => ({
      id: m.id,
      type: m.type,
      displayName: m.displayName,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      userId: m.userId,
      moduleId: m.moduleId,
      isConfirmedAnswer: m.isConfirmedAnswer,
      confirmedByName: m.confirmedBy
        ? `${m.confirmedBy.firstName} ${m.confirmedBy.lastName}`.trim()
        : null,
      isMentor: m.userId ? mentorSet.has(m.userId) : false,
    })),
    tenantSlug: ctx.tenantSlug,
    topic: tenant?.chatTopic ?? null,
    mentorIds,
  });
}
