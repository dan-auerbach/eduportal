"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { awardXp, getOrCreateBalance, xpToNextRank } from "@/lib/xp";
import { TenantAccessError } from "@/lib/tenant";
import { withAction } from "@/lib/observability";
import type { ActionResult } from "@/types";
import type { ReputationRank } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  userId: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  lifetimeXp: number;
  rank: ReputationRank;
  position: number;
};

export type XpBalanceDTO = {
  lifetimeXp: number;
  spendableXp: number;
  rank: ReputationRank;
  nextRank: { nextRank: ReputationRank; xpNeeded: number } | null;
  recentTransactions: {
    id: string;
    amount: number;
    source: string;
    description: string | null;
    createdAt: string;
  }[];
};

// ── Leaderboard ──────────────────────────────────────────────────────────────

export async function getLeaderboard(
  groupId?: string,
  limit: number = 50,
): Promise<ActionResult<LeaderboardEntry[]>> {
  try {
    const ctx = await getTenantContext();

    // If groupId, get user IDs in that group
    let userIdFilter: string[] | undefined;
    if (groupId) {
      const members = await prisma.userGroup.findMany({
        where: { groupId, tenantId: ctx.tenantId },
        select: { userId: true },
      });
      userIdFilter = members.map((m) => m.userId);
      if (userIdFilter.length === 0) {
        return { success: true, data: [] };
      }
    }

    const balances = await prisma.userXpBalance.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(userIdFilter ? { userId: { in: userIdFilter } } : {}),
      },
      orderBy: { lifetimeXp: "desc" },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
    });

    const data: LeaderboardEntry[] = balances.map((b, i) => ({
      userId: b.user.id,
      firstName: b.user.firstName,
      lastName: b.user.lastName,
      avatar: b.user.avatar,
      lifetimeXp: b.lifetimeXp,
      rank: b.rank,
      position: i + 1,
    }));

    return { success: true, data };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju leaderboarda" };
  }
}

// ── My XP Balance ────────────────────────────────────────────────────────────

export async function getMyXpBalance(): Promise<ActionResult<XpBalanceDTO>> {
  try {
    const ctx = await getTenantContext();
    const balance = await getOrCreateBalance(ctx.user.id, ctx.tenantId);

    const recentTransactions = await prisma.xpTransaction.findMany({
      where: { userId: ctx.user.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        amount: true,
        source: true,
        description: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: {
        lifetimeXp: balance.lifetimeXp,
        spendableXp: balance.totalXp,
        rank: balance.rank,
        nextRank: xpToNextRank(balance.lifetimeXp),
        recentTransactions: recentTransactions.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
        })),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── XP History (admin) ───────────────────────────────────────────────────────

export async function getXpHistory(
  userId: string,
  limit: number = 50,
): Promise<ActionResult<XpBalanceDTO["recentTransactions"]>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "VIEW_ALL_PROGRESS", { tenantId: ctx.tenantId });

    const transactions = await prisma.xpTransaction.findMany({
      where: { userId, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        source: true,
        description: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      data: transactions.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Manual XP Award (admin) ──────────────────────────────────────────────────

export async function awardManualXp(
  userId: string,
  amount: number,
  description: string,
): Promise<ActionResult<{ newTotal: number; newRank: ReputationRank }>> {
  return withAction("awardManualXp", async ({ log }) => {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    if (amount <= 0 || amount > 10000) {
      return { success: false, error: "Količina mora biti med 1 in 10000" };
    }

    const result = await awardXp({
      userId,
      tenantId: ctx.tenantId,
      amount,
      source: "MANUAL",
      description,
    });

    log({ targetUserId: userId, amount, newTotal: result.newTotal, newRank: result.newRank });

    return {
      success: true,
      data: { newTotal: result.newTotal, newRank: result.newRank },
    };
  });
}
