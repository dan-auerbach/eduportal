import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { checkModuleAccess } from "@/lib/permissions";
import { rateLimitChatSSE } from "@/lib/rate-limit";

const SSE_DURATION_MS = 25_000;
const POLL_INTERVAL_MS = 2_000;
const MAX_BATCH = 50;

const MSG_SELECT = {
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
} as const;

type RawMsg = {
  id: string;
  type: string;
  displayName: string;
  body: string;
  createdAt: Date;
  userId: string | null;
  moduleId: string | null;
  isConfirmedAnswer: boolean;
  confirmedBy: { firstName: string; lastName: string } | null;
};

function formatDTO(m: RawMsg, mentorSet: Set<string>) {
  return {
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
  };
}

/**
 * GET /api/chat/stream?moduleId=...&after=...
 * SSE endpoint that polls DB every 2s for 25s then closes.
 * Client reconnects automatically via EventSource + Last-Event-ID.
 */
export async function GET(req: NextRequest) {
  // Auth
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response("Unauthorized", { status: 401 });
  }

  // Rate limit
  const rl = await rateLimitChatSSE(ctx.user.id);
  if (!rl.success) {
    return new Response("Too many requests", { status: 429 });
  }

  const moduleId = req.nextUrl.searchParams.get("moduleId") ?? null;

  // Module access check
  if (moduleId) {
    try {
      const hasAccess = await checkModuleAccess(ctx.user.id, moduleId, ctx.tenantId);
      if (!hasAccess) {
        return new Response("No access", { status: 403 });
      }
    } catch {
      return new Response("Access check failed", { status: 403 });
    }
  }

  // Cursor: prefer Last-Event-ID header, fall back to query param
  const lastEventId = req.headers.get("Last-Event-ID");
  const afterParam = req.nextUrl.searchParams.get("after");
  let cursor = lastEventId ?? afterParam ?? null;

  // Fetch mentor set for module chat (once per connection)
  let mentorSet = new Set<string>();
  if (moduleId) {
    const mentors = await prisma.moduleMentor.findMany({
      where: { moduleId },
      select: { userId: true },
    });
    mentorSet = new Set(mentors.map((m) => m.userId));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let pingCount = 0;

      const enqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Stream closed
        }
      };

      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

      try {
        while (Date.now() - startTime < SSE_DURATION_MS) {
          // Query for new messages
          const where: Record<string, unknown> = {
            tenantId: ctx.tenantId,
            moduleId: moduleId ?? null,
            type: { not: "JOIN" as const },
          };
          if (cursor) {
            where.id = { gt: cursor };
          }

          const messages = await prisma.chatMessage.findMany({
            where,
            orderBy: { id: "asc" },
            take: MAX_BATCH,
            select: MSG_SELECT,
          });

          if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            cursor = lastMsg.id;

            const dtos = messages.map((m) => formatDTO(m as RawMsg, mentorSet));
            enqueue(`id: ${cursor}\nevent: message\ndata: ${JSON.stringify(dtos)}\n\n`);
          } else {
            // Keep-alive ping every other cycle
            pingCount++;
            if (pingCount % 3 === 0) {
              enqueue(`: ping\n\n`);
            }
          }

          await sleep(POLL_INTERVAL_MS);
        }

        // Graceful close — tell client to reconnect
        enqueue(`event: reconnect\ndata: {}\n\n`);
      } catch {
        // Stream error — client will reconnect
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
