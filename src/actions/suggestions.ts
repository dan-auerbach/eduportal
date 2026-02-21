"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_RULES } from "@/lib/xp";
import { rateLimitSuggestionVote, rateLimitSuggestionCreate } from "@/lib/rate-limit";
import { CreateSuggestionSchema, SuggestionCommentSchema } from "@/lib/validators";
import { withAction } from "@/lib/observability";
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
  return withAction("createSuggestion", async ({ log }) => {
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

    // Award XP for creating a suggestion (idempotent via partial unique index)
    try {
      await awardXp({
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        amount: ctx.config.xpRules.SUGGESTION_CREATED ?? XP_RULES.SUGGESTION_CREATED,
        source: "SUGGESTION_CREATED",
        sourceEntityId: suggestion.id,
        description: `Ustvarjen predlog: "${data.title}"`,
        config: ctx.config,
      });
    } catch {
      // Unique constraint violation = already awarded, silently skip
    }

    log({ suggestionId: suggestion.id, title: data.title });

    return { success: true, data: { id: suggestion.id } };
  });
}

// ── Vote on Suggestion (toggle) ──────────────────────────────────────────────

export async function voteSuggestion(
  suggestionId: string,
): Promise<ActionResult<{ voteCount: number; hasVoted: boolean }>> {
  return withAction("voteSuggestion", async ({ log }) => {
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
      const voteThreshold = ctx.config.suggestionVoteThreshold;
      if (
        suggestion.voteCount < voteThreshold &&
        newVoteCount >= voteThreshold
      ) {
        // Award XP to suggestion author
        await awardXp({
          userId: suggestion.userId,
          tenantId: ctx.tenantId,
          amount: ctx.config.xpRules.TOP_SUGGESTION ?? XP_RULES.TOP_SUGGESTION,
          source: "TOP_SUGGESTION",
          sourceEntityId: suggestionId,
          description: `Predlog "${suggestion.title}" je dosegel ${voteThreshold} glasov`,
          config: ctx.config,
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

    log({ suggestionId, hasVoted, newVoteCount });

    return { success: true, data: { voteCount: newVoteCount, hasVoted } };
  });
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

    const oldStatus = suggestion.status;

    await prisma.knowledgeSuggestion.update({
      where: { id },
      data: {
        status,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      },
    });

    // Award XP when approving (idempotent via partial unique index)
    if (status === "APPROVED") {
      try {
        await awardXp({
          userId: suggestion.userId,
          tenantId: ctx.tenantId,
          amount: ctx.config.xpRules.SUGGESTION_APPROVED ?? XP_RULES.SUGGESTION_APPROVED,
          source: "SUGGESTION_APPROVED",
          sourceEntityId: id,
          description: `Predlog odobren: "${suggestion.title}"`,
          config: ctx.config,
        });
      } catch {
        // Unique constraint violation = already awarded, silently skip
      }
    }

    // Reverse XP if changing FROM APPROVED to something else (rare admin reversal)
    if (oldStatus === "APPROVED" && status === "REJECTED") {
      const approvedXp = ctx.config.xpRules.SUGGESTION_APPROVED ?? XP_RULES.SUGGESTION_APPROVED;
      try {
        await prisma.xpTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            userId: suggestion.userId,
            amount: -approvedXp,
            source: "SUGGESTION_APPROVED",
            sourceEntityId: `${id}:reversal`,
            description: `Preklicana odobritev predloga: "${suggestion.title}"`,
          },
        });
        // Update balance
        await prisma.userXpBalance.updateMany({
          where: { userId: suggestion.userId, tenantId: ctx.tenantId },
          data: {
            totalXp: { decrement: approvedXp },
            lifetimeXp: { decrement: approvedXp },
          },
        });
      } catch {
        // Best effort — if reversal fails, don't block the status change
      }
    }

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
      metadata: { oldStatus, newStatus: status },
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

// ── Admin: Delete suggestion ──────────────────────────────────────────────────

export async function deleteSuggestion(
  id: string,
): Promise<ActionResult<void>> {
  return withAction("deleteSuggestion", async ({ log }) => {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_SUGGESTIONS", { tenantId: ctx.tenantId });

    const suggestion = await prisma.knowledgeSuggestion.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { _count: { select: { votes: true, comments: true } } },
    });
    if (!suggestion) return { success: false, error: "Predlog ne obstaja" };
    if (suggestion.status === "CONVERTED") {
      return { success: false, error: "Pretvorjenega predloga ni mogoče izbrisati" };
    }

    // Reverse XP awards (best-effort — don't block deletion on failure)
    try {
      const xpReversals: { amount: number; source: string; desc: string }[] = [];

      // Always reverse SUGGESTION_CREATED XP
      xpReversals.push({
        amount: ctx.config.xpRules.SUGGESTION_CREATED ?? XP_RULES.SUGGESTION_CREATED,
        source: "SUGGESTION_CREATED",
        desc: `Izbrisan predlog: "${suggestion.title}"`,
      });

      // Reverse SUGGESTION_APPROVED XP if suggestion was approved
      if (suggestion.status === "APPROVED") {
        xpReversals.push({
          amount: ctx.config.xpRules.SUGGESTION_APPROVED ?? XP_RULES.SUGGESTION_APPROVED,
          source: "SUGGESTION_APPROVED",
          desc: `Izbrisan odobren predlog: "${suggestion.title}"`,
        });
      }

      // Reverse TOP_SUGGESTION XP if suggestion crossed vote threshold
      if (suggestion.voteCount >= ctx.config.suggestionVoteThreshold) {
        xpReversals.push({
          amount: ctx.config.xpRules.TOP_SUGGESTION ?? XP_RULES.TOP_SUGGESTION,
          source: "TOP_SUGGESTION",
          desc: `Izbrisan priljubljen predlog: "${suggestion.title}"`,
        });
      }

      const totalReversal = xpReversals.reduce((sum, r) => sum + r.amount, 0);

      if (totalReversal > 0) {
        await prisma.$transaction([
          ...xpReversals.map((r) =>
            prisma.xpTransaction.create({
              data: {
                tenantId: ctx.tenantId,
                userId: suggestion.userId,
                amount: -r.amount,
                source: r.source as "SUGGESTION_CREATED" | "TOP_SUGGESTION" | "SUGGESTION_APPROVED",
                sourceEntityId: `${id}:deletion`,
                description: r.desc,
              },
            }),
          ),
          prisma.userXpBalance.updateMany({
            where: { userId: suggestion.userId, tenantId: ctx.tenantId },
            data: {
              totalXp: { decrement: totalReversal },
              lifetimeXp: { decrement: totalReversal },
            },
          }),
        ]);
      }
    } catch {
      // Best effort — if reversal fails, still delete the suggestion
    }

    // Delete related records and suggestion in a transaction
    await prisma.$transaction([
      prisma.knowledgeSuggestionVote.deleteMany({ where: { suggestionId: id } }),
      prisma.knowledgeSuggestionComment.deleteMany({ where: { suggestionId: id } }),
      prisma.knowledgeSuggestion.delete({ where: { id } }),
    ]);

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "SUGGESTION_DELETED",
      entityType: "KnowledgeSuggestion",
      entityId: id,
      metadata: {
        title: suggestion.title,
        status: suggestion.status,
        voteCount: suggestion.voteCount,
        commentCount: suggestion._count.comments,
        authorId: suggestion.userId,
      },
    });

    log({ suggestionId: id, title: suggestion.title, status: suggestion.status });

    return { success: true, data: undefined };
  });
}
