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
} as const;

export const RANK_THRESHOLDS: Record<ReputationRank, number> = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 2000,
  ELITE: 5000,
} as const;

/** Vote count threshold at which a knowledge suggestion awards XP to its author */
export const SUGGESTION_VOTE_THRESHOLD = 5;

// ── Rank Computation ─────────────────────────────────────────────────────────

export function computeRank(totalXp: number): ReputationRank {
  if (totalXp >= RANK_THRESHOLDS.ELITE) return "ELITE";
  if (totalXp >= RANK_THRESHOLDS.GOLD) return "GOLD";
  if (totalXp >= RANK_THRESHOLDS.SILVER) return "SILVER";
  return "BRONZE";
}

/** XP needed to reach the next rank, or null if already ELITE */
export function xpToNextRank(
  totalXp: number,
): { nextRank: ReputationRank; xpNeeded: number } | null {
  if (totalXp >= RANK_THRESHOLDS.ELITE) return null;
  if (totalXp >= RANK_THRESHOLDS.GOLD)
    return { nextRank: "ELITE", xpNeeded: RANK_THRESHOLDS.ELITE - totalXp };
  if (totalXp >= RANK_THRESHOLDS.SILVER)
    return { nextRank: "GOLD", xpNeeded: RANK_THRESHOLDS.GOLD - totalXp };
  return { nextRank: "SILVER", xpNeeded: RANK_THRESHOLDS.SILVER - totalXp };
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

  // Fetch current balance (or default)
  const existing = await prisma.userXpBalance.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  const oldRank = existing?.rank ?? "BRONZE";
  const newTotal = (existing?.totalXp ?? 0) + amount;
  const newRank = computeRank(newTotal);
  const rankChanged = newRank !== oldRank;

  // Atomic: create transaction + upsert balance
  await prisma.$transaction([
    prisma.xpTransaction.create({
      data: {
        tenantId,
        userId,
        amount,
        source,
        sourceEntityId,
        description,
      },
    }),
    prisma.userXpBalance.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      create: { tenantId, userId, totalXp: amount, rank: newRank },
      update: { totalXp: newTotal, rank: newRank },
    }),
  ]);

  // Audit
  await logAudit({
    actorId: userId,
    tenantId,
    action: "XP_AWARDED",
    entityType: "XpTransaction",
    entityId: userId,
    metadata: { amount, source, sourceEntityId, newTotal, newRank },
  });

  // Notification on rank change
  if (rankChanged) {
    await prisma.notification.create({
      data: {
        userId,
        tenantId,
        type: "XP_EARNED",
        title: `Novi rang: ${newRank}`,
        message: `Čestitamo! Dosegli ste rang ${newRank} z ${newTotal} XP točkami.`,
        link: "/leaderboard",
      },
    });
  }

  return { newTotal, newRank, rankChanged };
}

// ── Deduct XP ────────────────────────────────────────────────────────────────

export async function deductXp(params: {
  userId: string;
  tenantId: string;
  amount: number;
  description?: string;
}): Promise<{ newTotal: number; newRank: ReputationRank }> {
  const { userId, tenantId, amount, description } = params;

  const existing = await prisma.userXpBalance.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  const currentTotal = existing?.totalXp ?? 0;

  if (currentTotal < amount) {
    throw new Error("Premalo XP točk za odbitek");
  }

  const newTotal = currentTotal - amount;
  const newRank = computeRank(newTotal);

  await prisma.$transaction([
    prisma.xpTransaction.create({
      data: {
        tenantId,
        userId,
        amount: -amount,
        source: "MANUAL",
        description: description ?? "XP deduction",
      },
    }),
    prisma.userXpBalance.update({
      where: { userId_tenantId: { userId, tenantId } },
      data: { totalXp: newTotal, rank: newRank },
    }),
  ]);

  await logAudit({
    actorId: userId,
    tenantId,
    action: "XP_DEDUCTED",
    entityType: "XpTransaction",
    entityId: userId,
    metadata: { amount, newTotal, description },
  });

  return { newTotal, newRank };
}

// ── Get Balance (with lazy init) ─────────────────────────────────────────────

export async function getOrCreateBalance(
  userId: string,
  tenantId: string,
): Promise<{ totalXp: number; rank: ReputationRank }> {
  const balance = await prisma.userXpBalance.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (balance) return { totalXp: balance.totalXp, rank: balance.rank };
  return { totalXp: 0, rank: "BRONZE" };
}
