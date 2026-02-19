"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { deductXp, getOrCreateBalance } from "@/lib/xp";
import { rateLimitRedemption } from "@/lib/rate-limit";
import { CreateRewardSchema, UpdateRewardSchema } from "@/lib/validators";
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
  xpSpent: number;
  status: RedemptionStatus;
  rejectReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  userName?: string;
  userEmail?: string;
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
  try {
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

    return { success: true, data: { id: reward.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju nagrade" };
  }
}

// ── Admin: Update reward ─────────────────────────────────────────────────────

export async function updateReward(
  rewardId: string,
  input: unknown,
): Promise<ActionResult<void>> {
  try {
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

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Employee: Redeem reward ──────────────────────────────────────────────────

export async function redeemReward(
  rewardId: string,
): Promise<ActionResult<{ redemptionId: string; status: RedemptionStatus }>> {
  try {
    const ctx = await getTenantContext();

    // Rate limit
    const rl = await rateLimitRedemption(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč zahtev, poskusite pozneje" };

    // Fetch reward
    const reward = await prisma.reward.findFirst({
      where: { id: rewardId, tenantId: ctx.tenantId, active: true },
    });
    if (!reward) return { success: false, error: "Nagrada ni na voljo" };

    // Check balance
    const balance = await getOrCreateBalance(ctx.user.id, ctx.tenantId);
    if (balance.totalXp < reward.costXp) {
      return { success: false, error: "Premalo XP točk" };
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

    // Create redemption + optionally deduct XP
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

    // Deduct XP if auto-approved
    if (autoApprove) {
      await deductXp({
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        amount: reward.costXp,
        description: `Unovčitev nagrade: ${reward.title}`,
      });
    }

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "REWARD_REDEEMED",
      entityType: "RewardRedemption",
      entityId: redemption.id,
      metadata: { rewardId, rewardTitle: reward.title, xpSpent: reward.costXp, status },
    });

    return { success: true, data: { redemptionId: redemption.id, status } };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri unovčevanju" };
  }
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

// ── Admin: Review redemption ─────────────────────────────────────────────────

export async function reviewRedemption(
  redemptionId: string,
  approved: boolean,
  rejectReason?: string,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_REWARDS", { tenantId: ctx.tenantId });

    const redemption = await prisma.rewardRedemption.findFirst({
      where: { id: redemptionId, tenantId: ctx.tenantId, status: "PENDING" },
      include: { reward: { select: { title: true } } },
    });
    if (!redemption) return { success: false, error: "Unovčitev ne obstaja ali ni v čakanju" };

    const newStatus: RedemptionStatus = approved ? "APPROVED" : "REJECTED";

    await prisma.rewardRedemption.update({
      where: { id: redemptionId },
      data: {
        status: newStatus,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
        rejectReason: approved ? null : (rejectReason ?? null),
      },
    });

    // Deduct XP on approval
    if (approved) {
      await deductXp({
        userId: redemption.userId,
        tenantId: ctx.tenantId,
        amount: redemption.xpSpent,
        description: `Unovčitev nagrade: ${redemption.reward.title}`,
      });
    } else {
      // Refund quantity if rejected
      await prisma.reward.update({
        where: { id: redemption.rewardId },
        data: { quantityAvailable: { increment: 1 } },
      });
    }

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

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}
