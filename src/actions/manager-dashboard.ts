"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import type { ActionResult } from "@/types";
import type { ReputationRank } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskUser = {
  userId: string;
  userName: string;
  userEmail: string;
  moduleTitle: string;
  moduleId: string;
  daysOverdue: number;
  groupName: string;
};

export type TopPerformer = {
  userId: string;
  userName: string;
  avatar: string | null;
  totalXp: number;
  rank: ReputationRank;
  xpThisMonth: number;
};

export type HeatmapCell = {
  groupId: string;
  groupName: string;
  moduleId: string;
  moduleTitle: string;
  completionPercent: number;
  totalUsers: number;
  completedUsers: number;
};

export type ManagerDashboardData = {
  kpi: {
    usersAtRisk: number;
    avgEngagementXp: number;
    overallCompletionRate: number;
    activeSuggestions: number;
  };
  riskUsers: RiskUser[];
  topPerformers: TopPerformer[];
  heatmap: HeatmapCell[];
};

// ── Main Dashboard Query ─────────────────────────────────────────────────────

export async function getManagerDashboardData(
  groupId?: string,
): Promise<ActionResult<ManagerDashboardData>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "VIEW_MANAGER_DASHBOARD", {
      tenantId: ctx.tenantId,
    });

    const tenantId = ctx.tenantId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Parallel data fetching ──

    const [
      moduleGroups,
      allGroups,
      certificates,
      xpBalances,
      xpThisMonth,
      activeSuggestionsCount,
    ] = await Promise.all([
      // Module-group assignments with deadline info
      prisma.moduleGroup.findMany({
        where: {
          tenantId,
          ...(groupId ? { groupId } : {}),
          module: { status: "PUBLISHED" },
        },
        include: {
          module: { select: { id: true, title: true } },
          group: {
            select: {
              id: true,
              name: true,
              users: { select: { userId: true } },
            },
          },
        },
      }),

      // All groups for heatmap
      prisma.group.findMany({
        where: { tenantId, ...(groupId ? { id: groupId } : {}) },
        select: {
          id: true,
          name: true,
          users: { select: { userId: true } },
        },
      }),

      // All certificates (for completion calc)
      prisma.certificate.findMany({
        where: { tenantId },
        select: { userId: true, moduleId: true },
      }),

      // XP balances for top performers
      prisma.userXpBalance.findMany({
        where: { tenantId },
        orderBy: { totalXp: "desc" },
        take: 10,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
      }),

      // XP earned this month (for engagement)
      prisma.xpTransaction.groupBy({
        by: ["userId"],
        where: { tenantId, createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),

      // Active suggestions count
      prisma.knowledgeSuggestion.count({
        where: { tenantId, status: "OPEN" },
      }),
    ]);

    // ── Risk Users (overdue deadlines) ──

    const riskUsers: RiskUser[] = [];
    const certSet = new Set(certificates.map((c) => `${c.userId}:${c.moduleId}`));

    for (const mg of moduleGroups) {
      if (!mg.deadlineDays) continue;

      for (const member of mg.group.users) {
        // Skip if user already completed
        if (certSet.has(`${member.userId}:${mg.module.id}`)) continue;

        // Check if overdue
        const deadline = new Date(mg.assignedAt);
        deadline.setDate(deadline.getDate() + mg.deadlineDays);
        const daysOverdue = Math.ceil(
          (now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysOverdue > 0) {
          riskUsers.push({
            userId: member.userId,
            userName: "", // will be enriched below
            userEmail: "",
            moduleTitle: mg.module.title,
            moduleId: mg.module.id,
            daysOverdue,
            groupName: mg.group.name,
          });
        }
      }
    }

    // Enrich risk users with names (batch query)
    if (riskUsers.length > 0) {
      const userIds = [...new Set(riskUsers.map((r) => r.userId))];
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      for (const r of riskUsers) {
        const u = userMap.get(r.userId);
        if (u) {
          r.userName = `${u.firstName} ${u.lastName}`;
          r.userEmail = u.email;
        }
      }
    }

    riskUsers.sort((a, b) => b.daysOverdue - a.daysOverdue);

    // ── Completion Heatmap ──

    const heatmap: HeatmapCell[] = [];
    for (const mg of moduleGroups) {
      const totalUsers = mg.group.users.length;
      if (totalUsers === 0) continue;

      const completedUsers = mg.group.users.filter((member) =>
        certSet.has(`${member.userId}:${mg.module.id}`),
      ).length;

      heatmap.push({
        groupId: mg.group.id,
        groupName: mg.group.name,
        moduleId: mg.module.id,
        moduleTitle: mg.module.title,
        completionPercent:
          totalUsers > 0 ? Math.round((completedUsers / totalUsers) * 100) : 0,
        totalUsers,
        completedUsers,
      });
    }

    // ── Top Performers ──

    const xpMonthMap = new Map(
      xpThisMonth.map((x) => [x.userId, x._sum.amount ?? 0]),
    );

    const topPerformers: TopPerformer[] = xpBalances.map((b) => ({
      userId: b.user.id,
      userName: `${b.user.firstName} ${b.user.lastName}`,
      avatar: b.user.avatar,
      totalXp: b.totalXp,
      rank: b.rank,
      xpThisMonth: xpMonthMap.get(b.userId) ?? 0,
    }));

    // ── KPIs ──

    const totalXpEarned = xpThisMonth.reduce(
      (sum, x) => sum + (x._sum.amount ?? 0),
      0,
    );
    const activeUsers = xpThisMonth.length;
    const avgEngagementXp =
      activeUsers > 0 ? Math.round(totalXpEarned / activeUsers) : 0;

    // Overall completion rate
    const totalAssignments = moduleGroups.reduce(
      (sum, mg) => sum + mg.group.users.length,
      0,
    );
    const totalCompleted = heatmap.reduce(
      (sum, h) => sum + h.completedUsers,
      0,
    );
    const overallCompletionRate =
      totalAssignments > 0
        ? Math.round((totalCompleted / totalAssignments) * 100)
        : 0;

    return {
      success: true,
      data: {
        kpi: {
          usersAtRisk: riskUsers.length,
          avgEngagementXp,
          overallCompletionRate,
          activeSuggestions: activeSuggestionsCount,
        },
        riskUsers: riskUsers.slice(0, 50),
        topPerformers,
        heatmap,
      },
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError)
      return { success: false, error: e.message };
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka",
    };
  }
}
