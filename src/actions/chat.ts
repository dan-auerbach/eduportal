"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { checkModuleAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import {
  rateLimitChatMessage,
  rateLimitChatTopic,
  rateLimitConfirmAnswer,
} from "@/lib/rate-limit";
import { awardXp, XP_RULES } from "@/lib/xp";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatMessageDTO = {
  id: string;
  type: "MESSAGE" | "JOIN" | "SYSTEM" | "ACTION";
  displayName: string;
  body: string;
  createdAt: string; // ISO string for serialisation
  userId: string | null;
  moduleId: string | null;
  isConfirmedAnswer: boolean;
  confirmedByName: string | null;
  isMentor: boolean;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BODY_LENGTH = 500;
const MAX_FETCH_LIMIT = 200;
const MAX_TOPIC_LENGTH = 200;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDisplayName(user: { firstName: string; lastName: string; email: string }): string {
  const name = `${user.firstName}${user.lastName}`.trim();
  return name || user.email.split("@")[0];
}

function sanitizeBody(raw: string): string {
  // C10: NFC normalize + strip dangerous Unicode + control chars
  return raw
    .normalize("NFC")
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, "") // strip ZWJ, RTL override, BOM, etc.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .replace(/[\r\n]+/g, " ") // newlines → space
    .trim();
}

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

type RawMessage = {
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

function toDTO(m: RawMessage, mentorIds: Set<string> = new Set()): ChatMessageDTO {
  return {
    id: m.id,
    type: m.type as ChatMessageDTO["type"],
    displayName: m.displayName,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    userId: m.userId,
    moduleId: m.moduleId,
    isConfirmedAnswer: m.isConfirmedAnswer,
    confirmedByName: m.confirmedBy
      ? `${m.confirmedBy.firstName} ${m.confirmedBy.lastName}`.trim()
      : null,
    isMentor: m.userId ? mentorIds.has(m.userId) : false,
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Fetch the latest chat messages for the current tenant.
 * Supports cursor-based polling via `afterId`.
 * Pass `moduleId` to get module-specific chat; omit for global chat.
 */
export async function getChatMessages(
  afterId?: string,
  limit: number = MAX_FETCH_LIMIT,
  moduleId?: string | null,
): Promise<ActionResult<{ messages: ChatMessageDTO[]; tenantSlug: string }>> {
  try {
    const ctx = await getTenantContext();
    const take = Math.min(limit, MAX_FETCH_LIMIT);

    // If moduleId is provided, verify access
    if (moduleId) {
      const hasAccess = await checkModuleAccess(ctx.user.id, moduleId, ctx.tenantId);
      if (!hasAccess) {
        return { success: false, error: "Nimate dostopa do tega znanja" };
      }
    }

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      moduleId: moduleId ?? null, // null = global chat, string = module chat
      type: { not: "JOIN" as const },
    };

    if (afterId) {
      where.id = { gt: afterId };
    }

    // Fetch mentor IDs for this module (if module chat)
    let mentorIds = new Set<string>();
    if (moduleId) {
      const mentors = await prisma.moduleMentor.findMany({
        where: { moduleId },
        select: { userId: true },
      });
      mentorIds = new Set(mentors.map((m) => m.userId));
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: afterId ? { id: "asc" } : { createdAt: "desc" },
      take,
      select: MSG_SELECT,
    });

    // If fetching initial load (no afterId), reverse so oldest first
    const sorted = afterId ? messages : messages.reverse();

    return {
      success: true,
      data: {
        messages: sorted.map((m) => toDTO(m as RawMessage, mentorIds)),
        tenantSlug: ctx.tenantSlug,
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch messages" };
  }
}

/**
 * Send a chat message. Handles /commands server-side.
 * Pass `moduleId` to send to a module channel; omit for global chat.
 */
export async function sendChatMessage(
  body: string,
  moduleId?: string | null,
): Promise<ActionResult<ChatMessageDTO>> {
  try {
    const ctx = await getTenantContext();

    // If module chat, verify access
    if (moduleId) {
      const hasAccess = await checkModuleAccess(ctx.user.id, moduleId, ctx.tenantId);
      if (!hasAccess) {
        return { success: false, error: "Nimate dostopa do tega znanja" };
      }
    }

    // C7/C8: Centralized rate limit
    const rl = await rateLimitChatMessage(ctx.user.id);
    if (!rl.success) {
      return { success: false, error: "Prepočasno. Počakajte sekundo." };
    }

    // Sanitise
    const sanitized = sanitizeBody(body);
    if (!sanitized) {
      return { success: false, error: "Sporočilo ne sme biti prazno." };
    }
    if (sanitized.length > MAX_BODY_LENGTH) {
      return { success: false, error: `Sporočilo je predolgo (max ${MAX_BODY_LENGTH} znakov).` };
    }

    const displayName = getDisplayName(ctx.user);

    // ── Command parsing ──────────────────────────────────────────────
    if (sanitized.startsWith("/")) {
      const spaceIdx = sanitized.indexOf(" ");
      const cmd = (spaceIdx > 0 ? sanitized.slice(0, spaceIdx) : sanitized).toLowerCase();
      const arg = spaceIdx > 0 ? sanitized.slice(spaceIdx + 1).trim() : "";

      switch (cmd) {
        case "/me": {
          if (!arg) {
            return { success: false, error: "Uporaba: /me <besedilo>" };
          }
          const message = await prisma.chatMessage.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              type: "ACTION",
              displayName,
              body: arg,
              moduleId: moduleId ?? null,
            },
            select: MSG_SELECT,
          });
          return { success: true, data: toDTO(message as RawMessage) };
        }

        case "/shrug": {
          const shrugText = arg ? `${arg} ¯\\_(ツ)_/¯` : "¯\\_(ツ)_/¯";
          const message = await prisma.chatMessage.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              type: "MESSAGE",
              displayName,
              body: shrugText,
              moduleId: moduleId ?? null,
            },
            select: MSG_SELECT,
          });
          return { success: true, data: toDTO(message as RawMessage) };
        }

        case "/afk": {
          const afkBody = arg || "AFK";
          const message = await prisma.chatMessage.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              type: "ACTION",
              displayName,
              body: afkBody,
              moduleId: moduleId ?? null,
            },
            select: MSG_SELECT,
          });
          return { success: true, data: toDTO(message as RawMessage) };
        }

        case "/topic": {
          if (moduleId) {
            // Module chat topic — not implemented (module title IS the topic)
            return { success: false, error: "Ukaz /topic ni na voljo v pogovoru o znanju." };
          }
          return setChatTopic(arg);
        }

        default: {
          // Unknown command — return error for client to show locally
          return { success: false, error: `_UNKNOWN_CMD_:${cmd}` };
        }
      }
    }

    // ── Regular message ──────────────────────────────────────────────
    const message = await prisma.chatMessage.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        type: "MESSAGE",
        displayName,
        body: sanitized,
        moduleId: moduleId ?? null,
      },
      select: MSG_SELECT,
    });

    // Fire-and-forget: notify mentors if this is a module chat message
    if (moduleId) {
      void import("@/actions/email").then(({ sendMentorQuestionNotification }) =>
        sendMentorQuestionNotification({
          moduleId: moduleId!,
          tenantId: ctx.tenantId,
          senderName: displayName,
          messagePreview: sanitized,
        }),
      );
    }

    return { success: true, data: toDTO(message as RawMessage) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to send message" };
  }
}

/**
 * Set the channel topic for the current tenant.
 * Empty string clears the topic.
 */
export async function setChatTopic(topic: string): Promise<ActionResult<ChatMessageDTO>> {
  try {
    const ctx = await getTenantContext();

    // C1: Only ADMIN+ can set topic
    const role = ctx.effectiveRole;
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";
    if (!isAdmin) {
      return { success: false, error: "Samo administratorji lahko nastavljajo temo kanala." };
    }

    // C7/C8: Rate limit topic changes
    const rl = await rateLimitChatTopic(ctx.user.id);
    if (!rl.success) {
      return { success: false, error: "Preveč sprememb teme. Počakajte minuto." };
    }

    const sanitized = sanitizeBody(topic);
    if (sanitized.length > MAX_TOPIC_LENGTH) {
      return { success: false, error: `Tema je predolga (max ${MAX_TOPIC_LENGTH} znakov).` };
    }

    const displayName = getDisplayName(ctx.user);

    // Update tenant topic
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: { chatTopic: sanitized || null },
    });

    // Log as ACTION message
    const body = sanitized
      ? `je nastavil/a temo: ${sanitized}`
      : "je odstranil/a temo kanala";

    const message = await prisma.chatMessage.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        type: "ACTION",
        displayName,
        body,
      },
      select: MSG_SELECT,
    });

    return { success: true, data: toDTO(message as RawMessage) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to set topic" };
  }
}

/**
 * Confirm a message as an answer (mentor/admin only).
 */
export async function confirmAnswer(messageId: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();

    // C7/C8: Rate limit confirm actions
    const rl = await rateLimitConfirmAnswer(ctx.user.id);
    if (!rl.success) {
      return { success: false, error: "Preveč potrjevanj. Počakajte minuto." };
    }

    // Load the message
    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, tenantId: true, moduleId: true, type: true, userId: true },
    });

    if (!msg || msg.tenantId !== ctx.tenantId || !msg.moduleId) {
      return { success: false, error: "Sporočilo ne obstaja" };
    }

    // Only MESSAGE type can be confirmed
    if (msg.type !== "MESSAGE") {
      return { success: false, error: "Samo sporočila lahko potrdite kot odgovor" };
    }

    // Check if user is mentor for this module OR admin/super_admin
    const role = ctx.effectiveRole;
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";

    if (!isAdmin) {
      const isMentor = await prisma.moduleMentor.findUnique({
        where: {
          moduleId_userId: { moduleId: msg.moduleId, userId: ctx.user.id },
        },
      });
      if (!isMentor) {
        return { success: false, error: "Samo mentorji in administratorji lahko potrdijo odgovore" };
      }
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isConfirmedAnswer: true,
        confirmedById: ctx.user.id,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "ANSWER_CONFIRMED",
      entityType: "ChatMessage",
      entityId: messageId,
      tenantId: ctx.tenantId,
      metadata: { moduleId: msg.moduleId },
    });

    // Award XP to the message author for having their answer confirmed
    if (msg.userId && msg.userId !== ctx.user.id) {
      void awardXp({
        userId: msg.userId,
        tenantId: ctx.tenantId,
        amount: ctx.config.xpRules.MENTOR_CONFIRMATION ?? XP_RULES.MENTOR_CONFIRMATION,
        source: "MENTOR_CONFIRMATION",
        sourceEntityId: messageId,
        description: "Odgovor potrjen s strani mentorja",
        config: ctx.config,
      }).catch(() => {/* XP award failure should not break confirmation */});
    }

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri potrjevanju odgovora" };
  }
}

/**
 * Unconfirm a previously confirmed answer (mentor/admin only).
 */
export async function unconfirmAnswer(messageId: string): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();

    // C7/C8: Rate limit unconfirm actions (shared with confirm)
    const rl = await rateLimitConfirmAnswer(ctx.user.id);
    if (!rl.success) {
      return { success: false, error: "Preveč sprememb. Počakajte minuto." };
    }

    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { id: true, tenantId: true, moduleId: true, isConfirmedAnswer: true },
    });

    if (!msg || msg.tenantId !== ctx.tenantId || !msg.moduleId || !msg.isConfirmedAnswer) {
      return { success: false, error: "Sporočilo ne obstaja ali ni potrjeno" };
    }

    // Check permission
    const role = ctx.effectiveRole;
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";

    if (!isAdmin) {
      const isMentor = await prisma.moduleMentor.findUnique({
        where: {
          moduleId_userId: { moduleId: msg.moduleId, userId: ctx.user.id },
        },
      });
      if (!isMentor) {
        return { success: false, error: "Samo mentorji in administratorji lahko prekličejo potrditev" };
      }
    }

    await prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isConfirmedAnswer: false,
        confirmedById: null,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "ANSWER_UNCONFIRMED",
      entityType: "ChatMessage",
      entityId: messageId,
      tenantId: ctx.tenantId,
      metadata: { moduleId: msg.moduleId },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri preklicu potrditve" };
  }
}
