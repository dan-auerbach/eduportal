"use server";

import { prisma } from "@/lib/prisma";
import {
  getTenantContext,
  TenantAccessError,
  requireTenantRole,
} from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { CreateRadarPostSchema, RejectRadarPostSchema } from "@/lib/validators";
import { rateLimitRadarPost } from "@/lib/rate-limit";
import { t } from "@/lib/i18n";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type RadarPostDTO = {
  id: string;
  description: string;
  url: string;
  sourceDomain: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";
  rejectReason: string | null;
  pinned: boolean;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
  approvedAt: string | null;
  saved: boolean; // Whether current user has saved/bookmarked this post
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const POST_SELECT = {
  id: true,
  description: true,
  url: true,
  sourceDomain: true,
  status: true,
  rejectReason: true,
  pinned: true,
  createdAt: true,
  approvedAt: true,
  createdBy: {
    select: { id: true, firstName: true, lastName: true },
  },
  approvedBy: {
    select: { firstName: true, lastName: true },
  },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toDTO(p: any, savedPostIds?: Set<string>): RadarPostDTO {
  return {
    id: p.id,
    description: p.description,
    url: p.url,
    sourceDomain: p.sourceDomain,
    status: p.status,
    rejectReason: p.rejectReason,
    pinned: p.pinned,
    createdBy: p.createdBy,
    approvedBy: p.approvedBy,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    approvedAt: p.approvedAt
      ? p.approvedAt instanceof Date
        ? p.approvedAt.toISOString()
        : p.approvedAt
      : null,
    saved: savedPostIds?.has(p.id) ?? false,
  };
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Sanitize URL: trim, block dangerous schemes */
function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  // Block dangerous schemes
  if (/^(javascript|data|file|vbscript|blob):/i.test(trimmed)) {
    throw new Error("URL format ni dovoljen");
  }
  return trimmed;
}

function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";
}

/** Load saved post IDs for the current user, with timestamps for sort */
async function getUserSaves(
  userId: string,
): Promise<{ ids: Set<string>; pinnedAt: Map<string, Date> }> {
  const saves = await prisma.radarSave.findMany({
    where: { userId },
    select: { postId: true, createdAt: true },
  });
  return {
    ids: new Set(saves.map((s) => s.postId)),
    pinnedAt: new Map(saves.map((s) => [s.postId, s.createdAt])),
  };
}

/**
 * Sort posts: personal-pinned first (by pinnedAt desc),
 * then global-pinned, then rest by approvedAt desc.
 */
function sortWithPersonalPins(
  posts: RadarPostDTO[],
  pinnedAt: Map<string, Date>,
): RadarPostDTO[] {
  return posts.sort((a, b) => {
    const aPinned = pinnedAt.has(a.id);
    const bPinned = pinnedAt.has(b.id);

    // Personal pins first
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    if (aPinned && bPinned) {
      // Both personal-pinned: most recently pinned first
      const aTime = pinnedAt.get(a.id)!.getTime();
      const bTime = pinnedAt.get(b.id)!.getTime();
      return bTime - aTime;
    }

    // Then global pinned
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    // Then by approvedAt desc (or createdAt as fallback)
    const aDate = new Date(a.approvedAt || a.createdAt).getTime();
    const bDate = new Date(b.approvedAt || b.createdAt).getTime();
    return bDate - aDate;
  });
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get approved radar posts for the main feed.
 * Pinned first, then sorted by approvedAt desc. Max 50.
 */
export async function getApprovedRadarPosts(): Promise<ActionResult<RadarPostDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const [posts, saves] = await Promise.all([
      prisma.mentorRadarPost.findMany({
        where: { tenantId: ctx.tenantId, status: "APPROVED" },
        orderBy: [{ pinned: "desc" }, { approvedAt: "desc" }],
        take: 50,
        select: POST_SELECT,
      }),
      getUserSaves(ctx.user.id),
    ]);

    const dtos = posts.map((p) => toDTO(p, saves.ids));
    // Re-sort: personal-pinned first, then global pinned, then rest
    return { success: true, data: sortWithPersonalPins(dtos, saves.pinnedAt) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju objav" };
  }
}

/**
 * Get radar posts that the current user has saved/bookmarked.
 */
export async function getSavedRadarPosts(): Promise<ActionResult<RadarPostDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const saves = await prisma.radarSave.findMany({
      where: { userId: ctx.user.id },
      select: { postId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    if (saves.length === 0) {
      return { success: true, data: [] };
    }

    const postIds = saves.map((s) => s.postId);
    const posts = await prisma.mentorRadarPost.findMany({
      where: {
        id: { in: postIds },
        tenantId: ctx.tenantId,
        status: "APPROVED",
      },
      select: POST_SELECT,
    });

    const savedIds = new Set(postIds);
    // Sort by save time (most recent first)
    const saveOrder = new Map(saves.map((s, i) => [s.postId, i]));
    const dtos = posts
      .map((p) => toDTO(p, savedIds))
      .sort((a, b) => (saveOrder.get(a.id) ?? 0) - (saveOrder.get(b.id) ?? 0));

    return { success: true, data: dtos };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju objav" };
  }
}

/**
 * Get current user's radar posts (all statuses).
 */
export async function getMyRadarPosts(): Promise<ActionResult<RadarPostDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const [posts, saves] = await Promise.all([
      prisma.mentorRadarPost.findMany({
        where: { tenantId: ctx.tenantId, createdById: ctx.user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: POST_SELECT,
      }),
      getUserSaves(ctx.user.id),
    ]);

    const dtos = posts.map((p) => toDTO(p, saves.ids));
    return { success: true, data: sortWithPersonalPins(dtos, saves.pinnedAt) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju objav" };
  }
}

/**
 * Get pending radar posts for admin moderation queue.
 */
export async function getPendingRadarPosts(): Promise<ActionResult<RadarPostDTO[]>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const posts = await prisma.mentorRadarPost.findMany({
      where: { tenantId: ctx.tenantId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: POST_SELECT,
    });

    return { success: true, data: posts.map((p) => toDTO(p)) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju objav" };
  }
}

/**
 * Get latest approved radar posts for the dashboard widget.
 */
export async function getLatestApprovedRadarPosts(
  limit: number = 5,
): Promise<ActionResult<RadarPostDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const posts = await prisma.mentorRadarPost.findMany({
      where: { tenantId: ctx.tenantId, status: "APPROVED" },
      orderBy: [{ pinned: "desc" }, { approvedAt: "desc" }],
      take: limit,
      select: POST_SELECT,
    });

    return { success: true, data: posts.map((p) => toDTO(p)) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

/**
 * Check if the same URL was approved in the last 30 days.
 */
export async function checkDuplicateRadarUrl(
  url: string,
): Promise<ActionResult<{ isDuplicate: boolean; existingDomain?: string }>> {
  try {
    const ctx = await getTenantContext();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const existing = await prisma.mentorRadarPost.findFirst({
      where: {
        tenantId: ctx.tenantId,
        url: url.trim(),
        status: "APPROVED",
        approvedAt: { gte: thirtyDaysAgo },
      },
      select: { sourceDomain: true },
    });

    return {
      success: true,
      data: {
        isDuplicate: !!existing,
        existingDomain: existing?.sourceDomain,
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a new radar post. Any authenticated user. Rate limited.
 * Admin posts are auto-approved.
 */
export async function createRadarPost(
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();

    // Rate limit
    const rl = await rateLimitRadarPost(ctx.user.id);
    if (!rl.success) {
      return { success: false, error: t("radar.rateLimitReached") };
    }

    const parsed = CreateRadarPostSchema.parse(data);
    const safeUrl = sanitizeUrl(parsed.url);

    const post = await prisma.mentorRadarPost.create({
      data: {
        tenantId: ctx.tenantId,
        description: parsed.description.trim(),
        url: safeUrl,
        sourceDomain: parseDomain(safeUrl),
        createdById: ctx.user.id,
        // Auto-approve all posts
        status: "APPROVED",
        approvedById: ctx.user.id,
        approvedAt: new Date(),
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_CREATED",
      entityType: "MentorRadarPost",
      entityId: post.id,
      tenantId: ctx.tenantId,
      metadata: { url: post.url, autoApproved: true },
    });

    return { success: true, data: { id: post.id } };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri ustvarjanju objave",
    };
  }
}

/**
 * Approve a pending radar post. Admin+ only.
 */
export async function approveRadarPost(
  id: string,
): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true, status: true, sourceDomain: true, createdById: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    if (post.status !== "PENDING") {
      return { success: false, error: "Objava ni v čakanju" };
    }

    await prisma.mentorRadarPost.update({
      where: { id },
      data: {
        status: "APPROVED",
        approvedById: ctx.user.id,
        approvedAt: new Date(),
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_APPROVED",
      entityType: "MentorRadarPost",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: { sourceDomain: post.sourceDomain },
    });

    // Notify the author
    if (post.createdById) {
      await prisma.notification.create({
        data: {
          userId: post.createdById,
          tenantId: ctx.tenantId,
          type: "RADAR_APPROVED",
          title: t("radar.notifApprovedTitle", { domain: post.sourceDomain }),
          message: t("radar.notifApprovedMessage"),
          link: `/radar`,
        },
      });
    }

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri potrjevanju objave",
    };
  }
}

/**
 * Reject a pending radar post. Admin+ only. Requires a reason.
 */
export async function rejectRadarPost(
  id: string,
  data: unknown,
): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");
    const parsed = RejectRadarPostSchema.parse(data);

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true, status: true, sourceDomain: true, createdById: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    if (post.status !== "PENDING") {
      return { success: false, error: "Objava ni v čakanju" };
    }

    await prisma.mentorRadarPost.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectReason: parsed.reason.trim(),
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_REJECTED",
      entityType: "MentorRadarPost",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: { sourceDomain: post.sourceDomain, reason: parsed.reason },
    });

    // Notify the author
    if (post.createdById) {
      await prisma.notification.create({
        data: {
          userId: post.createdById,
          tenantId: ctx.tenantId,
          type: "RADAR_REJECTED",
          title: t("radar.notifRejectedTitle", { domain: post.sourceDomain }),
          message: t("radar.notifRejectedMessage", { reason: parsed.reason }),
          link: `/radar`,
        },
      });
    }

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri zavrnitvi objave",
    };
  }
}

/**
 * Archive a radar post. Admin+ only.
 */
export async function archiveRadarPost(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true, sourceDomain: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    await prisma.mentorRadarPost.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_ARCHIVED",
      entityType: "MentorRadarPost",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: { sourceDomain: post.sourceDomain },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri arhiviranju objave",
    };
  }
}

/**
 * Pin a radar post (global). Admin+ only. Max 3 pinned per tenant.
 */
export async function pinRadarPost(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true, status: true, pinned: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    if (post.status !== "APPROVED") {
      return { success: false, error: "Samo potrjene objave se lahko pripnejo" };
    }

    if (post.pinned) {
      return { success: true, data: undefined };
    }

    const pinnedCount = await prisma.mentorRadarPost.count({
      where: { tenantId: ctx.tenantId, pinned: true },
    });

    if (pinnedCount >= 3) {
      return { success: false, error: t("radar.maxPinnedReached") };
    }

    await prisma.mentorRadarPost.update({
      where: { id },
      data: { pinned: true },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_PINNED",
      entityType: "MentorRadarPost",
      entityId: id,
      tenantId: ctx.tenantId,
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

/**
 * Unpin a radar post (global). Admin+ only.
 */
export async function unpinRadarPost(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    await prisma.mentorRadarPost.update({
      where: { id },
      data: { pinned: false },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_UNPINNED",
      entityType: "MentorRadarPost",
      entityId: id,
      tenantId: ctx.tenantId,
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── User Save / Bookmark ─────────────────────────────────────────────────────

/**
 * Toggle save/bookmark on a radar post for the current user.
 */
export async function toggleRadarSave(
  postId: string,
): Promise<ActionResult<{ saved: boolean }>> {
  try {
    const ctx = await getTenantContext();

    const existing = await prisma.radarSave.findUnique({
      where: { userId_postId: { userId: ctx.user.id, postId } },
    });

    if (existing) {
      await prisma.radarSave.delete({
        where: { id: existing.id },
      });
      return { success: true, data: { saved: false } };
    } else {
      await prisma.radarSave.create({
        data: { userId: ctx.user.id, postId },
      });
      return { success: true, data: { saved: true } };
    }
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Radar Seen (for unread counter) ──────────────────────────────────────────

/**
 * Mark radar as seen for the current user. Called when user visits /radar.
 */
export async function markRadarSeen(): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();

    await prisma.radarSeen.upsert({
      where: {
        userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId },
      },
      update: { lastSeenAt: new Date() },
      create: {
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        lastSeenAt: new Date(),
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}
