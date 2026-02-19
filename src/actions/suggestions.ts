"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { awardXp, SUGGESTION_VOTE_THRESHOLD, XP_RULES } from "@/lib/xp";
import { rateLimitSuggestionVote, rateLimitSuggestionCreate } from "@/lib/rate-limit";
import { CreateSuggestionSchema, SuggestionCommentSchema } from "@/lib/validators";
import type { ActionResult } from "@/types";
import type { SuggestionStatus } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type SuggestionDTO = {
  id: string;
  title: string;
  description: string;
  link: string | null;
  isAnonymous: boolean;
  status: SuggestionStatus;
  voteCount: number;
  commentCount: number;
  hasVoted: boolean;
  authorName: string | null;
  createdAt: string;
};

export type SuggestionDetailDTO = SuggestionDTO & {
  comments: SuggestionCommentDTO[];
  convertedModuleId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type SuggestionCommentDTO = {
  id: string;
  body: string;
  authorName: string;
  authorAvatar: string | null;
  parentId: string | null;
  createdAt: string;
};

// ── List Suggestions ─────────────────────────────────────────────────────────

export async function getSuggestions(
  sort: "popular" | "newest" = "newest",
  status?: SuggestionStatus,
): Promise<ActionResult<SuggestionDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const suggestions = await prisma.knowledgeSuggestion.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
      },
      orderBy: sort === "popular" ? { voteCount: "desc" } : { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { firstName: true, lastName: true } },
        votes: { where: { userId: ctx.user.id }, select: { id: true } },
        _count: { select: { comments: true } },
      },
    });

    return {
      success: true,
      data: suggestions.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        link: s.link,
        isAnonymous: s.isAnonymous,
        status: s.status,
        voteCount: s.voteCount,
        commentCount: s._count.comments,
        hasVoted: s.votes.length > 0,
        authorName: s.isAnonymous ? null : `${s.user.firstName} ${s.user.lastName}`,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Suggestion Detail ────────────────────────────────────────────────────────

export async function getSuggestionDetail(
  id: string,
): Promise<ActionResult<SuggestionDetailDTO>> {
  try {
    const ctx = await getTenantContext();

    const s = await prisma.knowledgeSuggestion.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        user: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
        votes: { where: { userId: ctx.user.id }, select: { id: true } },
        _count: { select: { comments: true } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });

    if (!s) return { success: false, error: "Predlog ne obstaja" };

    return {
      success: true,
      data: {
        id: s.id,
        title: s.title,
        description: s.description,
        link: s.link,
        isAnonymous: s.isAnonymous,
        status: s.status,
        voteCount: s.voteCount,
        commentCount: s._count.comments,
        hasVoted: s.votes.length > 0,
        authorName: s.isAnonymous ? null : `${s.user.firstName} ${s.user.lastName}`,
        createdAt: s.createdAt.toISOString(),
        convertedModuleId: s.convertedModuleId,
        reviewedByName: s.reviewedBy
          ? `${s.reviewedBy.firstName} ${s.reviewedBy.lastName}`
          : null,
        reviewedAt: s.reviewedAt?.toISOString() ?? null,
        comments: s.comments.map((c) => ({
          id: c.id,
          body: c.body,
          authorName: `${c.user.firstName} ${c.user.lastName}`,
          authorAvatar: c.user.avatar,
          parentId: c.parentId,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Create Suggestion ────────────────────────────────────────────────────────

export async function createSuggestion(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();

    const rl = await rateLimitSuggestionCreate(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč predlogov, poskusite pozneje" };

    const data = CreateSuggestionSchema.parse(input);

    const suggestion = await prisma.knowledgeSuggestion.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        title: data.title,
        description: data.description,
        link: data.link ?? null,
        isAnonymous: data.isAnonymous,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "SUGGESTION_CREATED",
      entityType: "KnowledgeSuggestion",
      entityId: suggestion.id,
      metadata: { title: data.title, isAnonymous: data.isAnonymous },
    });

    return { success: true, data: { id: suggestion.id } };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju predloga" };
  }
}

// ── Vote on Suggestion (toggle) ──────────────────────────────────────────────

export async function voteSuggestion(
  suggestionId: string,
): Promise<ActionResult<{ voteCount: number; hasVoted: boolean }>> {
  try {
    const ctx = await getTenantContext();

    const rl = await rateLimitSuggestionVote(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč glasov, poskusite pozneje" };

    const suggestion = await prisma.knowledgeSuggestion.findFirst({
      where: { id: suggestionId, tenantId: ctx.tenantId },
    });
    if (!suggestion) return { success: false, error: "Predlog ne obstaja" };

    // Check existing vote
    const existingVote = await prisma.knowledgeSuggestionVote.findUnique({
      where: { userId_suggestionId: { userId: ctx.user.id, suggestionId } },
    });

    let newVoteCount: number;
    let hasVoted: boolean;

    if (existingVote) {
      // Remove vote
      await prisma.$transaction([
        prisma.knowledgeSuggestionVote.delete({ where: { id: existingVote.id } }),
        prisma.knowledgeSuggestion.update({
          where: { id: suggestionId },
          data: { voteCount: { decrement: 1 } },
        }),
      ]);
      newVoteCount = suggestion.voteCount - 1;
      hasVoted = false;
    } else {
      // Add vote
      await prisma.$transaction([
        prisma.knowledgeSuggestionVote.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.user.id,
            suggestionId,
          },
        }),
        prisma.knowledgeSuggestion.update({
          where: { id: suggestionId },
          data: { voteCount: { increment: 1 } },
        }),
      ]);
      newVoteCount = suggestion.voteCount + 1;
      hasVoted = true;

      // Check if crossed threshold → notify admins + award XP to author
      if (
        suggestion.voteCount < SUGGESTION_VOTE_THRESHOLD &&
        newVoteCount >= SUGGESTION_VOTE_THRESHOLD
      ) {
        // Award XP to suggestion author
        await awardXp({
          userId: suggestion.userId,
          tenantId: ctx.tenantId,
          amount: XP_RULES.TOP_SUGGESTION,
          source: "TOP_SUGGESTION",
          sourceEntityId: suggestionId,
          description: `Predlog "${suggestion.title}" je dosegel ${SUGGESTION_VOTE_THRESHOLD} glasov`,
        });

        // Notify admins
        const admins = await prisma.membership.findMany({
          where: {
            tenantId: ctx.tenantId,
            role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN"] },
          },
          select: { userId: true },
        });

        if (admins.length > 0) {
          await prisma.notification.createMany({
            data: admins.map((a) => ({
              userId: a.userId,
              tenantId: ctx.tenantId,
              type: "SUGGESTION_POPULAR" as const,
              title: `Priljubljen predlog: ${suggestion.title}`,
              message: `Predlog "${suggestion.title}" je dosegel ${newVoteCount} glasov.`,
              link: `/suggestions/${suggestionId}`,
            })),
          });
        }
      }
    }

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "SUGGESTION_VOTED",
      entityType: "KnowledgeSuggestion",
      entityId: suggestionId,
      metadata: { hasVoted, newVoteCount },
    });

    return { success: true, data: { voteCount: newVoteCount, hasVoted } };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Comment on Suggestion ────────────────────────────────────────────────────

export async function commentOnSuggestion(
  suggestionId: string,
  input: unknown,
): Promise<ActionResult<SuggestionCommentDTO>> {
  try {
    const ctx = await getTenantContext();
    const data = SuggestionCommentSchema.parse(input);

    const suggestion = await prisma.knowledgeSuggestion.findFirst({
      where: { id: suggestionId, tenantId: ctx.tenantId },
    });
    if (!suggestion) return { success: false, error: "Predlog ne obstaja" };

    const comment = await prisma.knowledgeSuggestionComment.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        suggestionId,
        body: data.body,
        parentId: data.parentId ?? null,
      },
      include: {
        user: { select: { firstName: true, lastName: true, avatar: true } },
      },
    });

    return {
      success: true,
      data: {
        id: comment.id,
        body: comment.body,
        authorName: `${comment.user.firstName} ${comment.user.lastName}`,
        authorAvatar: comment.user.avatar,
        parentId: comment.parentId,
        createdAt: comment.createdAt.toISOString(),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Update suggestion status ──────────────────────────────────────────

export async function updateSuggestionStatus(
  id: string,
  status: "APPROVED" | "REJECTED",
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_SUGGESTIONS", { tenantId: ctx.tenantId });

    const suggestion = await prisma.knowledgeSuggestion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!suggestion) return { success: false, error: "Predlog ne obstaja" };

    await prisma.knowledgeSuggestion.update({
      where: { id },
      data: {
        status,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      },
    });

    // Notify author
    await prisma.notification.create({
      data: {
        userId: suggestion.userId,
        tenantId: ctx.tenantId,
        type: "SUGGESTION_STATUS_CHANGED",
        title: status === "APPROVED"
          ? `Predlog odobren: ${suggestion.title}`
          : `Predlog zavrnjen: ${suggestion.title}`,
        message: status === "APPROVED"
          ? `Vaš predlog "${suggestion.title}" je bil odobren.`
          : `Vaš predlog "${suggestion.title}" je bil zavrnjen.`,
        link: `/suggestions/${id}`,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "SUGGESTION_STATUS_CHANGED",
      entityType: "KnowledgeSuggestion",
      entityId: id,
      metadata: { oldStatus: suggestion.status, newStatus: status },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Convert suggestion to module ──────────────────────────────────────

export async function convertSuggestionToModule(
  id: string,
): Promise<ActionResult<{ moduleId: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_SUGGESTIONS", { tenantId: ctx.tenantId });

    const suggestion = await prisma.knowledgeSuggestion.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!suggestion) return { success: false, error: "Predlog ne obstaja" };
    if (suggestion.status === "CONVERTED") {
      return { success: false, error: "Predlog je že pretvorjen v modul" };
    }

    // Create draft module from suggestion
    const module = await prisma.module.create({
      data: {
        tenantId: ctx.tenantId,
        title: suggestion.title,
        description: suggestion.description,
        createdById: ctx.user.id,
        status: "DRAFT",
      },
    });

    // Update suggestion
    await prisma.knowledgeSuggestion.update({
      where: { id },
      data: {
        status: "CONVERTED",
        convertedModuleId: module.id,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "SUGGESTION_CONVERTED",
      entityType: "KnowledgeSuggestion",
      entityId: id,
      metadata: { moduleId: module.id, title: suggestion.title },
    });

    return { success: true, data: { moduleId: module.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}
