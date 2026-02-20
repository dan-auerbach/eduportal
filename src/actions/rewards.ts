"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getOrCreateBalance } from "@/lib/xp";
import { rateLimitRedemption } from "@/lib/rate-limit";
import { CreateRewardSchema, UpdateRewardSchema } from "@/lib/validators";
import { withAction } from "@/lib/observability";
import type { ActionResult } from "@/types";
import type { RedemptionStatus } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type RewardDTO = {
  id: string;
  title: string;
  description: string | null;
  costXp: number;
  monthlyLimit: number | null;
  quantityAvailable: number | null;
  approvalRequired: boolean;
  active: boolean;
  imageUrl: string | null;
};

export type RedemptionDTO = {
  id: string;
  rewardTitle: string;
  rewardId: string;
  xpSpent: number;
  status: RedemptionStatus;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  userName?: string;
  userEmail?: string;
  reviewedByName?: string | null;
};

// ── Employee: List active rewards ────────────────────────────────────────────

export async function getRewards(): Promise<ActionResult<RewardDTO[]>> {
  try {
    const ctx = await getTenantContext();
    const rewards = await prisma.reward.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { costXp: "asc" },
    });

    return {
      success: true,
      data: rewards.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        costXp: r.costXp,
        monthlyLimit: r.monthlyLimit,
        quantityAvailable: r.quantityAvailable,
        approvalRequired: r.approvalRequired,
        active: r.active,
        imageUrl: r.imageUrl,
      })),
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Employee: Storefront data (richer than getRewards) ──────────────────────

export type StorefrontRewardDTO = RewardDTO & {
  monthlyRedemptions: number; // how many times this user redeemed this month
  totalRedemptionsThisMonth: number; // total redemptions across all users this month
};

export async function getStorefrontRewards(): Promise<ActionResult<StorefrontRewardDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const rewards = await prisma.reward.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { costXp: "asc" },
    });

    // Get this month's start
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get user's monthly redemptions for all rewards
    const userRedemptions = await prisma.rewardRedemption.groupBy({
      by: ["rewardId"],
      where: {
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        status: { in: ["PENDING", "APPROVED"] },
        createdAt: { gte: monthStart },
      },
      _count: true,
    });
    const userRedemptionMap = new Map(userRedemptions.map((r) => [r.rewardId, r._count]));

    // Get total monthly redemptions for popularity badge
    const totalRedemptions = await prisma.rewardRedemption.groupBy({
      by: ["rewardId"],
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["PENDING", "APPROVED"] },
        createdAt: { gte: monthStart },
      },
      _count: true,
    });
    const totalRedemptionMap = new Map(totalRedemptions.map((r) => [r.rewardId, r._count]));

    return {
      success: true,
      data: rewards.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        costXp: r.costXp,
        monthlyLimit: r.monthlyLimit,
        quantityAvailable: r.quantityAvailable,
        approvalRequired: r.approvalRequired,
        active: r.active,
        imageUrl: r.imageUrl,
        monthlyRedemptions: userRedemptionMap.get(r.id) ?? 0,
        totalRedemptionsThisMonth: totalRedemptionMap.get(r.id) ?? 0,
      })),
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: List all rewards ──────────────────────────────────────────────────

export async function getAdminRewards(): Promise<ActionResult<RewardDTO[]>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const rewards = await prisma.reward.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: rewards.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        costXp: r.costXp,
        monthlyLimit: r.monthlyLimit,
        quantityAvailable: r.quantityAvailable,
        approvalRequired: r.approvalRequired,
        active: r.active,
        imageUrl: r.imageUrl,
      })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Create reward ─────────────────────────────────────────────────────

export async function createReward(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return withAction("createReward", async ({ log }) => {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const data = CreateRewardSchema.parse(input);
    const reward = await prisma.reward.create({
      data: {
        ...data,
        tenantId: ctx.tenantId,
        createdById: ctx.user.id,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "REWARD_CREATED",
      entityType: "Reward",
      entityId: reward.id,
      metadata: { title: reward.title, costXp: reward.costXp },
    });

    log({ rewardId: reward.id, title: reward.title });

    return { success: true, data: { id: reward.id } };
  });
}

// ── Admin: Update reward ─────────────────────────────────────────────────────

export async function updateReward(
  rewardId: string,
  input: unknown,
): Promise<ActionResult<void>> {
  return withAction("updateReward", async ({ log }) => {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const data = UpdateRewardSchema.parse(input);
    const existing = await prisma.reward.findFirst({
      where: { id: rewardId, tenantId: ctx.tenantId },
    });
    if (!existing) return { success: false, error: "Nagrada ne obstaja" };

    await prisma.reward.update({
      where: { id: rewardId },
      data,
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "REWARD_UPDATED",
      entityType: "Reward",
      entityId: rewardId,
      metadata: data,
    });

    log({ rewardId, title: existing.title });

    return { success: true, data: undefined };
  });
}

// ── Employee: Redeem reward ──────────────────────────────────────────────────

export async function redeemReward(
  rewardId: string,
): Promise<ActionResult<{ redemptionId: string; status: RedemptionStatus }>> {
  return withAction("redeemReward", async ({ log }) => {
    const ctx = await getTenantContext();

    // Rate limit
    const rl = await rateLimitRedemption(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč zahtev, poskusite pozneje" };

    // Fetch reward
    const reward = await prisma.reward.findFirst({
      where: { id: rewardId, tenantId: ctx.tenantId, active: true },
    });
    if (!reward) return { success: false, error: "Nagrada ni na voljo" };

    // Check spendable balance
    const balance = await getOrCreateBalance(ctx.user.id, ctx.tenantId);
    if (balance.totalXp < reward.costXp) {
      return { success: false, error: "Premalo XP točk za porabo" };
    }

    // Check monthly limit
    if (reward.monthlyLimit != null) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const thisMonthCount = await prisma.rewardRedemption.count({
        where: {
          rewardId,
          tenantId: ctx.tenantId,
          status: { in: ["PENDING", "APPROVED"] },
          createdAt: { gte: startOfMonth },
        },
      });
      if (thisMonthCount >= reward.monthlyLimit) {
        return { success: false, error: "Mesečna omejitev nagrade je dosežena" };
      }
    }

    // Check quantity
    if (reward.quantityAvailable != null && reward.quantityAvailable <= 0) {
      return { success: false, error: "Nagrada ni več na voljo" };
    }

    // Determine status
    const autoApprove = !reward.approvalRequired;
    const status: RedemptionStatus = autoApprove ? "APPROVED" : "PENDING";

    // Create redemption + deduct XP atomically in one transaction
    const redemption = await prisma.$transaction(async (tx) => {
      // Decrement quantity if applicable
      if (reward.quantityAvailable != null) {
        const updated = await tx.reward.update({
          where: { id: rewardId },
          data: { quantityAvailable: { decrement: 1 } },
        });
        if (updated.quantityAvailable != null && updated.quantityAvailable < 0) {
          throw new Error("Nagrada ni več na voljo");
        }
      }

      // Deduct XP inside transaction if auto-approved (atomic with redemption)
      if (autoApprove) {
        const bal = await tx.userXpBalance.findUnique({
          where: { userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId } },
        });
        const currentTotal = bal?.totalXp ?? 0;
        if (currentTotal < reward.costXp) {
          throw new Error("Premalo XP točk za porabo");
        }
        await tx.xpTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.user.id,
            amount: -reward.costXp,
            source: "MANUAL",
            description: `Unovčitev nagrade: ${reward.title}`,
          },
        });
        await tx.userXpBalance.update({
          where: { userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId } },
          data: { totalXp: { decrement: reward.costXp } },
        });
      }

      const r = await tx.rewardRedemption.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.user.id,
          rewardId,
          xpSpent: reward.costXp,
          status,
        },
      });

      return r;
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "REWARD_REDEEMED",
      entityType: "RewardRedemption",
      entityId: redemption.id,
      metadata: { rewardId, rewardTitle: reward.title, xpSpent: reward.costXp, status },
    });

    // Notify admins about the redemption
    const userName = `${ctx.user.firstName} ${ctx.user.lastName}`;
    const admins = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenantId,
        role: { in: ["ADMIN", "SUPER_ADMIN", "OWNER"] },
        userId: { not: ctx.user.id },
        user: { isActive: true, deletedAt: null },
      },
      select: { userId: true },
    });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.userId,
          tenantId: ctx.tenantId,
          type: "SYSTEM" as const,
          title: status === "PENDING"
            ? `Nova zahteva za nagrado: ${reward.title}`
            : `Nagrada unovčena: ${reward.title}`,
          message: status === "PENDING"
            ? `${userName} želi unovčiti nagrado "${reward.title}" (${reward.costXp} XP). Čaka na odobritev.`
            : `${userName} je unovčil/a nagrado "${reward.title}" (${reward.costXp} XP).`,
          link: "/admin/rewards",
        })),
      });
    }

    log({ rewardId, rewardTitle: reward.title, xpSpent: reward.costXp, status });

    return { success: true, data: { redemptionId: redemption.id, status } };
  });
}

// ── Employee: My redemptions ─────────────────────────────────────────────────

export async function getMyRedemptions(): Promise<ActionResult<RedemptionDTO[]>> {
  try {
    const ctx = await getTenantContext();
    const redemptions = await prisma.rewardRedemption.findMany({
      where: { userId: ctx.user.id, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: { reward: { select: { title: true } } },
    });

    return {
      success: true,
      data: redemptions.map((r) => ({
        id: r.id,
        rewardTitle: r.reward.title,
        rewardId: r.rewardId,
        xpSpent: r.xpSpent,
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
      })),
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Pending redemptions ───────────────────────────────────────────────

export async function getPendingRedemptions(): Promise<ActionResult<RedemptionDTO[]>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const redemptions = await prisma.rewardRedemption.findMany({
      where: { tenantId: ctx.tenantId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: {
        reward: { select: { title: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return {
      success: true,
      data: redemptions.map((r) => ({
        id: r.id,
        rewardTitle: r.reward.title,
        rewardId: r.rewardId,
        xpSpent: r.xpSpent,
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        userName: `${r.user.firstName} ${r.user.lastName}`,
        userEmail: r.user.email,
      })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: All redemptions (history) ────────────────────────────────────────

export async function getAllRedemptions(
  rewardId?: string,
): Promise<ActionResult<RedemptionDTO[]>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const redemptions = await prisma.rewardRedemption.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(rewardId ? { rewardId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        reward: { select: { title: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
    });

    return {
      success: true,
      data: redemptions.map((r) => ({
        id: r.id,
        rewardTitle: r.reward.title,
        rewardId: r.rewardId,
        xpSpent: r.xpSpent,
        status: r.status,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        userName: `${r.user.firstName} ${r.user.lastName}`,
        userEmail: r.user.email,
        reviewedByName: r.reviewedBy
          ? `${r.reviewedBy.firstName} ${r.reviewedBy.lastName}`
          : null,
      })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Review redemption ─────────────────────────────────────────────────

export async function reviewRedemption(
  redemptionId: string,
  approved: boolean,
  rejectReason?: string,
): Promise<ActionResult<void>> {
  return withAction("reviewRedemption", async ({ log }) => {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const redemption = await prisma.rewardRedemption.findFirst({
      where: { id: redemptionId, tenantId: ctx.tenantId, status: "PENDING" },
      include: { reward: { select: { title: true } } },
    });
    if (!redemption) return { success: false, error: "Unovčitev ne obstaja ali ni v čakanju" };

    const newStatus: RedemptionStatus = approved ? "APPROVED" : "REJECTED";

    // Update status + XP deduction/quantity refund atomically
    await prisma.$transaction(async (tx) => {
      await tx.rewardRedemption.update({
        where: { id: redemptionId },
        data: {
          status: newStatus,
          reviewedById: ctx.user.id,
          reviewedAt: new Date(),
          rejectReason: approved ? null : (rejectReason ?? null),
        },
      });

      if (approved) {
        // Deduct XP inside transaction (atomic with status change)
        const bal = await tx.userXpBalance.findUnique({
          where: { userId_tenantId: { userId: redemption.userId, tenantId: ctx.tenantId } },
        });
        const currentTotal = bal?.totalXp ?? 0;
        if (currentTotal < redemption.xpSpent) {
          throw new Error("Uporabnik nima dovolj XP točk");
        }
        await tx.xpTransaction.create({
          data: {
            tenantId: ctx.tenantId,
            userId: redemption.userId,
            amount: -redemption.xpSpent,
            source: "MANUAL",
            description: `Unovčitev nagrade: ${redemption.reward.title}`,
          },
        });
        await tx.userXpBalance.update({
          where: { userId_tenantId: { userId: redemption.userId, tenantId: ctx.tenantId } },
          data: { totalXp: { decrement: redemption.xpSpent } },
        });
      } else {
        // Refund quantity if rejected
        await tx.reward.update({
          where: { id: redemption.rewardId },
          data: { quantityAvailable: { increment: 1 } },
        });
      }
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId: redemption.userId,
        tenantId: ctx.tenantId,
        type: approved ? "REWARD_APPROVED" : "REWARD_REJECTED",
        title: approved
          ? `Nagrada odobrena: ${redemption.reward.title}`
          : `Nagrada zavrnjena: ${redemption.reward.title}`,
        message: approved
          ? `Vaša zahteva za nagrado "${redemption.reward.title}" je bila odobrena.`
          : `Vaša zahteva za nagrado "${redemption.reward.title}" je bila zavrnjena.${rejectReason ? ` Razlog: ${rejectReason}` : ""}`,
        link: "/rewards",
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: approved ? "REWARD_APPROVED" : "REWARD_REJECTED",
      entityType: "RewardRedemption",
      entityId: redemptionId,
      metadata: { rewardTitle: redemption.reward.title, approved, rejectReason },
    });

    log({ redemptionId, approved, rewardTitle: redemption.reward.title });

    return { success: true, data: undefined };
  });
}
