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
  title: string;
  description: string;
  url: string;
  sourceDomain: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "ARCHIVED";
  rejectReason: string | null;
  pinned: boolean;
  tag: "AI" | "TECH" | "PRODUCTIVITY" | "MEDIA" | "SECURITY" | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  createdAt: string;
  approvedAt: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const POST_SELECT = {
  id: true,
  title: true,
  description: true,
  url: true,
  sourceDomain: true,
  status: true,
  rejectReason: true,
  pinned: true,
  tag: true,
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
function toDTO(p: any): RadarPostDTO {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    url: p.url,
    sourceDomain: p.sourceDomain,
    status: p.status,
    rejectReason: p.rejectReason,
    pinned: p.pinned,
    tag: p.tag,
    createdBy: p.createdBy,
    approvedBy: p.approvedBy,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    approvedAt: p.approvedAt
      ? p.approvedAt instanceof Date
        ? p.approvedAt.toISOString()
        : p.approvedAt
      : null,
  };
}

function parseDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get approved radar posts for the main feed.
 * Pinned first, then sorted by approvedAt desc. Max 50.
 */
export async function getApprovedRadarPosts(): Promise<ActionResult<RadarPostDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const posts = await prisma.mentorRadarPost.findMany({
      where: { tenantId: ctx.tenantId, status: "APPROVED" },
      orderBy: [{ pinned: "desc" }, { approvedAt: "desc" }],
      take: 50,
      select: POST_SELECT,
    });

    return { success: true, data: posts.map(toDTO) };
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

    const posts = await prisma.mentorRadarPost.findMany({
      where: { tenantId: ctx.tenantId, createdById: ctx.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: POST_SELECT,
    });

    return { success: true, data: posts.map(toDTO) };
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

    return { success: true, data: posts.map(toDTO) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju objav" };
  }
}

/**
 * Get a single radar post by ID.
 * Non-admin users can only view their own posts or approved posts.
 */
export async function getRadarPostById(
  id: string,
): Promise<ActionResult<RadarPostDTO>> {
  try {
    const ctx = await getTenantContext();

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { ...POST_SELECT, tenantId: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    // Non-admin can only see own posts or approved posts
    const isAdmin =
      ctx.effectiveRole === "ADMIN" ||
      ctx.effectiveRole === "SUPER_ADMIN" ||
      ctx.effectiveRole === "OWNER";

    if (!isAdmin && post.status !== "APPROVED" && post.createdBy?.id !== ctx.user.id) {
      return { success: false, error: "Nimate dostopa do te objave" };
    }

    return { success: true, data: toDTO(post) };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju objave" };
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

    return { success: true, data: posts.map(toDTO) };
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
): Promise<ActionResult<{ isDuplicate: boolean; existingTitle?: string }>> {
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
      select: { title: true },
    });

    return {
      success: true,
      data: {
        isDuplicate: !!existing,
        existingTitle: existing?.title,
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

    const post = await prisma.mentorRadarPost.create({
      data: {
        tenantId: ctx.tenantId,
        title: parsed.title.trim(),
        description: parsed.description.trim(),
        url: parsed.url.trim(),
        sourceDomain: parseDomain(parsed.url.trim()),
        tag: parsed.tag ?? null,
        createdById: ctx.user.id,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "RADAR_POST_CREATED",
      entityType: "MentorRadarPost",
      entityId: post.id,
      tenantId: ctx.tenantId,
      metadata: { title: post.title, url: post.url },
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
      select: { tenantId: true, status: true, title: true, createdById: true },
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
      metadata: { title: post.title },
    });

    // Notify the author
    if (post.createdById) {
      await prisma.notification.create({
        data: {
          userId: post.createdById,
          tenantId: ctx.tenantId,
          type: "RADAR_APPROVED",
          title: t("radar.notifApprovedTitle", { title: post.title }),
          message: t("radar.notifApprovedMessage"),
          link: `/radar/${id}`,
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
      select: { tenantId: true, status: true, title: true, createdById: true },
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
      metadata: { title: post.title, reason: parsed.reason },
    });

    // Notify the author
    if (post.createdById) {
      await prisma.notification.create({
        data: {
          userId: post.createdById,
          tenantId: ctx.tenantId,
          type: "RADAR_REJECTED",
          title: t("radar.notifRejectedTitle", { title: post.title }),
          message: t("radar.notifRejectedMessage", { reason: parsed.reason }),
          link: `/radar/${id}`,
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
      select: { tenantId: true, title: true },
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
      metadata: { title: post.title },
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
 * Pin a radar post. Admin+ only. Max 3 pinned per tenant.
 */
export async function pinRadarPost(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true, status: true, pinned: true, title: true },
    });

    if (!post || post.tenantId !== ctx.tenantId) {
      return { success: false, error: "Objava ne obstaja" };
    }

    if (post.status !== "APPROVED") {
      return { success: false, error: "Samo potrjene objave se lahko pripnejo" };
    }

    if (post.pinned) {
      return { success: true, data: undefined }; // Already pinned
    }

    // Check max 3 pinned
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
      metadata: { title: post.title },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri pripenjanju objave",
    };
  }
}

/**
 * Unpin a radar post. Admin+ only.
 */
export async function unpinRadarPost(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const post = await prisma.mentorRadarPost.findUnique({
      where: { id },
      select: { tenantId: true, title: true },
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
      metadata: { title: post.title },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri odpenjanju objave",
    };
  }
}
