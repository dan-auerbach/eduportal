"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatMessageDTO = {
  id: string;
  type: "MESSAGE" | "JOIN" | "SYSTEM" | "ACTION";
  displayName: string;
  body: string;
  createdAt: string; // ISO string for serialisation
  userId: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BODY_LENGTH = 500;
const MAX_FETCH_LIMIT = 200;
const MAX_TOPIC_LENGTH = 200;
const RATE_LIMIT_MS = 1000; // 1 message per second

// Simple in-memory rate limiter (per user+tenant)
const lastMessageTime = new Map<string, number>();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDisplayName(user: { firstName: string; lastName: string; email: string }): string {
  const name = `${user.firstName}${user.lastName}`.trim();
  return name || user.email.split("@")[0];
}

function sanitizeBody(raw: string): string {
  // Trim, strip control chars except space, replace newlines with space
  return raw
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
} as const;

function toDTO(m: { id: string; type: string; displayName: string; body: string; createdAt: Date; userId: string | null }): ChatMessageDTO {
  return {
    ...m,
    type: m.type as ChatMessageDTO["type"],
    createdAt: m.createdAt.toISOString(),
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Fetch the latest chat messages for the current tenant.
 * Supports cursor-based polling via `afterId`.
 */
export async function getChatMessages(
  afterId?: string,
  limit: number = MAX_FETCH_LIMIT,
): Promise<ActionResult<{ messages: ChatMessageDTO[]; tenantSlug: string }>> {
  try {
    const ctx = await getTenantContext();
    const take = Math.min(limit, MAX_FETCH_LIMIT);

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };

    if (afterId) {
      where.id = { gt: afterId };
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
        messages: sorted.map(toDTO),
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
 * Send a chat message. Handles /commands server-side:
 * - /me <text>   → ACTION message
 * - /shrug       → MESSAGE with ¯\_(ツ)_/¯
 * - /afk [reason]→ ACTION message "je AFK (reason)"
 * - /topic <text>→ sets topic + ACTION message
 * - /help        → should be handled client-side (never reaches here)
 *
 * Returns { _command: "UNKNOWN", cmd } for unknown /commands so client can show local error.
 */
export async function sendChatMessage(body: string): Promise<ActionResult<ChatMessageDTO>> {
  try {
    const ctx = await getTenantContext();

    // Rate limit check
    const rateKey = `${ctx.user.id}:${ctx.tenantId}`;
    const now = Date.now();
    const lastTime = lastMessageTime.get(rateKey) ?? 0;
    if (now - lastTime < RATE_LIMIT_MS) {
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
            },
            select: MSG_SELECT,
          });
          lastMessageTime.set(rateKey, now);
          return { success: true, data: toDTO(message) };
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
            },
            select: MSG_SELECT,
          });
          lastMessageTime.set(rateKey, now);
          return { success: true, data: toDTO(message) };
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
            },
            select: MSG_SELECT,
          });
          lastMessageTime.set(rateKey, now);
          return { success: true, data: toDTO(message) };
        }

        case "/topic": {
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
      },
      select: MSG_SELECT,
    });

    lastMessageTime.set(rateKey, now);

    return { success: true, data: toDTO(message) };
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

    return { success: true, data: toDTO(message) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to set topic" };
  }
}

/**
 * Log a JOIN message when user enters the chat.
 * Should be called once per session (client tracks via sessionStorage).
 */
export async function joinChat(): Promise<ActionResult<ChatMessageDTO>> {
  try {
    const ctx = await getTenantContext();
    const displayName = getDisplayName(ctx.user);

    const message = await prisma.chatMessage.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        type: "JOIN",
        displayName,
        body: "",
      },
      select: MSG_SELECT,
    });

    return { success: true, data: toDTO(message) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to join chat" };
  }
}
