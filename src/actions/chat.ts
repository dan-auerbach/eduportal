"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatMessageDTO = {
  id: string;
  type: "MESSAGE" | "JOIN" | "SYSTEM";
  displayName: string;
  body: string;
  createdAt: string; // ISO string for serialisation
  userId: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BODY_LENGTH = 500;
const MAX_FETCH_LIMIT = 200;
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
      take: afterId ? take : take, // always limit
      select: {
        id: true,
        type: true,
        displayName: true,
        body: true,
        createdAt: true,
        userId: true,
      },
    });

    // If fetching initial load (no afterId), reverse so oldest first
    const sorted = afterId ? messages : messages.reverse();

    return {
      success: true,
      data: {
        messages: sorted.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
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
 * Send a chat message.
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

    // Sanitise & validate
    const sanitized = sanitizeBody(body);
    if (!sanitized) {
      return { success: false, error: "Sporočilo ne sme biti prazno." };
    }
    if (sanitized.length > MAX_BODY_LENGTH) {
      return { success: false, error: `Sporočilo je predolgo (max ${MAX_BODY_LENGTH} znakov).` };
    }

    const displayName = getDisplayName(ctx.user);

    const message = await prisma.chatMessage.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        type: "MESSAGE",
        displayName,
        body: sanitized,
      },
      select: {
        id: true,
        type: true,
        displayName: true,
        body: true,
        createdAt: true,
        userId: true,
      },
    });

    lastMessageTime.set(rateKey, now);

    return {
      success: true,
      data: {
        ...message,
        createdAt: message.createdAt.toISOString(),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to send message" };
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
      select: {
        id: true,
        type: true,
        displayName: true,
        body: true,
        createdAt: true,
        userId: true,
      },
    });

    return {
      success: true,
      data: {
        ...message,
        createdAt: message.createdAt.toISOString(),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Failed to join chat" };
  }
}
