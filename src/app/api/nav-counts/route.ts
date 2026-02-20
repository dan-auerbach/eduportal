import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";

/**
 * GET /api/nav-counts?chatAfter=<lastReadMessageId>
 *
 * Lightweight endpoint that returns all sidebar/header badge counts
 * in a single request. Replaces separate polling of:
 *   - /api/chat/unread
 *   - /api/radar/unread
 *   - /api/notifications/unread-count
 *   - /api/updates (for unseen dot)
 *
 * Returns only integers and a timestamp — no PII, no message content.
 */
export async function GET(req: NextRequest) {
  const start = Date.now();

  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({
        chatUnread: 0,
        radarUnread: 0,
        notificationsUnread: 0,
        latestUpdateAt: null,
      });
    }
    return NextResponse.json({
      chatUnread: 0,
      radarUnread: 0,
      notificationsUnread: 0,
      latestUpdateAt: null,
      nextLiveEvent: null,
    });
  }

  const chatAfter = req.nextUrl.searchParams.get("chatAfter");

  try {
    // Run all count queries in parallel for minimum latency
    const [chatCount, radarData, notifCount, latestUpdate, nextEvent, xpBalance] = await Promise.all([
      // 1) Chat unread: count global messages after lastRead cursor
      prisma.chatMessage.count({
        where: {
          tenantId: ctx.tenantId,
          moduleId: null,
          type: { not: "JOIN" as const },
          ...(chatAfter ? { id: { gt: chatAfter } } : {}),
        },
      }),

      // 2) Radar unread: get lastSeen, then count approved posts after it
      prisma.radarSeen
        .findUnique({
          where: {
            userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId },
          },
          select: { lastSeenAt: true },
        })
        .then((seen) =>
          prisma.mentorRadarPost.count({
            where: {
              tenantId: ctx.tenantId,
              status: "APPROVED",
              ...(seen?.lastSeenAt
                ? { approvedAt: { gt: seen.lastSeenAt } }
                : {}),
            },
          })
        ),

      // 3) Notifications unread count
      prisma.notification.count({
        where: {
          userId: ctx.user.id,
          tenantId: ctx.tenantId,
          isRead: false,
        },
      }),

      // 4) Latest changelog entry timestamp (for unseen updates dot)
      prisma.changelogEntry.findFirst({
        where: { tenantId: null },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),

      // 5) Next upcoming live event (for sidebar sub-label)
      prisma.mentorLiveEvent.findFirst({
        where: { tenantId: ctx.tenantId, startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        select: { title: true, startsAt: true },
      }),

      // 6) XP balance for header badge
      prisma.userXpBalance.findUnique({
        where: { userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId } },
        select: { totalXp: true },
      }),
    ]);

    const elapsed = Date.now() - start;

    const response = NextResponse.json({
      chatUnread: Math.min(chatCount, 99),
      radarUnread: Math.min(radarData, 99),
      notificationsUnread: Math.min(notifCount, 99),
      latestUpdateAt: latestUpdate?.createdAt?.toISOString() ?? null,
      nextLiveEvent: nextEvent
        ? { title: nextEvent.title, startsAt: nextEvent.startsAt.toISOString() }
        : null,
      xpTotal: xpBalance?.totalXp ?? 0,
    });

    // Server-Timing header for observability
    response.headers.set("Server-Timing", `db;dur=${elapsed}`);

    return response;
  } catch {
    return NextResponse.json({
      chatUnread: 0,
      radarUnread: 0,
      notificationsUnread: 0,
      latestUpdateAt: null,
      nextLiveEvent: null,
    });
  }
}
