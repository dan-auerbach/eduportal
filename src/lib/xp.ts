/**
 * XP Engine — handles XP awards, deductions, rank computation, and balance management.
 *
 * All XP is tenant-scoped. Each XP event creates an XpTransaction record
 * and updates the pre-computed UserXpBalance for fast leaderboard queries.
 */

import { prisma } from "./prisma";
import { logAudit } from "./audit";
import type { ReputationRank, XpSourceType } from "@/generated/prisma/client";

// ── XP Rules ─────────────────────────────────────────────────────────────────

export const XP_RULES = {
  MODULE_COMPLETED: 100,
  QUIZ_HIGH_SCORE: 50, // score >= 90%
  MENTOR_CONFIRMATION: 25,
  TOP_SUGGESTION: 75, // suggestion reaches vote threshold
  COMPLIANCE_RENEWAL: 50, // timely renewal bonus
  SUGGESTION_CREATED: 10, // XP for creating a suggestion
  SUGGESTION_APPROVED: 30, // XP when admin approves suggestion
  EVENT_ATTENDED: 20, // XP when admin confirms attendance
} as const;

export const RANK_THRESHOLDS: Record<ReputationRank, number> = {
  VAJENEC: 0,
  POMOCNIK: 1500,
  MOJSTER: 3500,
  MENTOR: 6000,
} as const;

/** Human-readable rank labels (for notifications and UI) */
export const RANK_LABELS: Record<ReputationRank, string> = {
  VAJENEC: "Vajenec",
  POMOCNIK: "Pomočnik",
  MOJSTER: "Mojster",
  MENTOR: "Mentor",
} as const;

/** Vote count threshold at which a knowledge suggestion awards XP to its author */
export const SUGGESTION_VOTE_THRESHOLD = 5;

// ── Rank Computation ─────────────────────────────────────────────────────────

export function computeRank(totalXp: number): ReputationRank {
  if (totalXp >= RANK_THRESHOLDS.MENTOR) return "MENTOR";
  if (totalXp >= RANK_THRESHOLDS.MOJSTER) return "MOJSTER";
  if (totalXp >= RANK_THRESHOLDS.POMOCNIK) return "POMOCNIK";
  return "VAJENEC";
}

/** XP needed to reach the next rank (based on lifetimeXp), or null if already MENTOR */
export function xpToNextRank(
  lifetimeXp: number,
): { nextRank: ReputationRank; xpNeeded: number } | null {
  if (lifetimeXp >= RANK_THRESHOLDS.MENTOR) return null;
  if (lifetimeXp >= RANK_THRESHOLDS.MOJSTER)
    return { nextRank: "MENTOR", xpNeeded: RANK_THRESHOLDS.MENTOR - lifetimeXp };
  if (lifetimeXp >= RANK_THRESHOLDS.POMOCNIK)
    return { nextRank: "MOJSTER", xpNeeded: RANK_THRESHOLDS.MOJSTER - lifetimeXp };
  return { nextRank: "POMOCNIK", xpNeeded: RANK_THRESHOLDS.POMOCNIK - lifetimeXp };
}

// ── Award XP ─────────────────────────────────────────────────────────────────

export async function awardXp(params: {
  userId: string;
  tenantId: string;
  amount: number;
  source: XpSourceType;
  sourceEntityId?: string;
  description?: string;
}): Promise<{
  newTotal: number;
  newRank: ReputationRank;
  rankChanged: boolean;
}> {
  const { userId, tenantId, amount, source, sourceEntityId, description } =
    params;

  // Interactive transaction: read + write are atomic (row-level lock via findUnique)
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.userXpBalance.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    const oldRank = existing?.rank ?? "VAJENEC";
    const newLifetime = (existing?.lifetimeXp ?? 0) + amount;
    const newTotal = (existing?.totalXp ?? 0) + amount;
    const newRank = computeRank(newLifetime);
    const rankChanged = newRank !== oldRank;

    await tx.xpTransaction.create({
      data: {
        tenantId,
        userId,
        amount,
        source,
        sourceEntityId,
        description,
      },
    });

    await tx.userXpBalance.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { tenantId, userId, lifetimeXp: amount, totalXp: amount, rank: newRank },
      update: { lifetimeXp: newLifetime, totalXp: newTotal, rank: newRank },
    });

    return { newLifetime, newTotal, newRank, rankChanged };
  });

  // Audit (best-effort, outside transaction to avoid holding lock)
  await logAudit({
    actorId: userId,
    tenantId,
    action: "XP_AWARDED",
    entityType: "XpTransaction",
    entityId: userId,
    metadata: { amount, source, sourceEntityId, newLifetime: result.newLifetime, newTotal: result.newTotal, newRank: result.newRank },
  });

  // Notification on rank change
  if (result.rankChanged) {
    await prisma.notification.create({
      data: {
        userId,
        tenantId,
        type: "XP_EARNED",
        title: `Novi rang: ${RANK_LABELS[result.newRank]}`,
        message: `Čestitamo! Dosegli ste rang ${RANK_LABELS[result.newRank]} z ${result.newLifetime} XP točkami.`,
        link: "/leaderboard",
      },
    });
  }

  return { newTotal: result.newTotal, newRank: result.newRank, rankChanged: result.rankChanged };
}

// ── Deduct XP ────────────────────────────────────────────────────────────────

export async function deductXp(params: {
  userId: string;
  tenantId: string;
  amount: number;
  description?: string;
}): Promise<{ newTotal: number; rank: ReputationRank }> {
  const { userId, tenantId, amount, description } = params;

  // Interactive transaction: read + write are atomic (row-level lock)
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.userXpBalance.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    const currentTotal = existing?.totalXp ?? 0;

    if (currentTotal < amount) {
      throw new Error("Premalo XP točk za odbitek");
    }

    const newTotal = currentTotal - amount;
    const rank = existing?.rank ?? "VAJENEC";

    await tx.xpTransaction.create({
      data: {
        tenantId,
        userId,
        amount: -amount,
        source: "MANUAL",
        description: description ?? "XP deduction",
      },
    });

    await tx.userXpBalance.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { totalXp: newTotal },
      // Note: lifetimeXp and rank are NOT changed on deduction
    });

    return { newTotal, rank };
  });

  await logAudit({
    actorId: userId,
    tenantId,
    action: "XP_DEDUCTED",
    entityType: "XpTransaction",
    entityId: userId,
    metadata: { amount, newTotal: result.newTotal, description },
  });

  return result;
}

// ── Get Balance (with lazy init) ─────────────────────────────────────────────

export async function getOrCreateBalance(
  userId: string,
  tenantId: string,
): Promise<{ lifetimeXp: number; totalXp: number; rank: ReputationRank }> {
  const balance = await prisma.userXpBalance.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (balance) return { lifetimeXp: balance.lifetimeXp, totalXp: balance.totalXp, rank: balance.rank };
  return { lifetimeXp: 0, totalXp: 0, rank: "VAJENEC" };
}
