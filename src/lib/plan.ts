import type { TenantPlan } from "@/generated/prisma/client";
import { prisma } from "./prisma";

// ---------------------------------------------------------------------------
// Plan Limits
// ---------------------------------------------------------------------------

export type PlanLimits = {
  maxUsers: number | null; // null = unlimited
  maxModules: number | null;
};

const PLAN_LIMITS: Record<TenantPlan, PlanLimits> = {
  FREE: {
    maxUsers: 2,
    maxModules: 3,
  },
  STARTER: {
    maxUsers: 30,
    maxModules: 50,
  },
  PRO: {
    maxUsers: null,
    maxModules: null,
  },
};

export function getPlanLimits(plan: TenantPlan): PlanLimits {
  return PLAN_LIMITS[plan];
}

// ---------------------------------------------------------------------------
// Usage Counts
// ---------------------------------------------------------------------------

export async function getTenantUsage(tenantId: string) {
  const [userCount, moduleCount] = await Promise.all([
    prisma.membership.count({ where: { tenantId } }),
    prisma.module.count({ where: { tenantId } }),
  ]);
  return { userCount, moduleCount };
}

// ---------------------------------------------------------------------------
// Limit Checks — return { allowed: true } or { allowed: false, code, current, max }
// ---------------------------------------------------------------------------

export type LimitCheckResult =
  | { allowed: true }
  | { allowed: false; code: string; current: number; max: number };

export async function checkUserLimit(
  tenantId: string,
  plan: TenantPlan
): Promise<LimitCheckResult> {
  const limits = getPlanLimits(plan);
  if (limits.maxUsers === null) return { allowed: true };

  const current = await prisma.membership.count({ where: { tenantId } });
  if (current >= limits.maxUsers) {
    return { allowed: false, code: "LIMIT_USERS_REACHED", current, max: limits.maxUsers };
  }
  return { allowed: true };
}

export async function checkModuleLimit(
  tenantId: string,
  plan: TenantPlan
): Promise<LimitCheckResult> {
  const limits = getPlanLimits(plan);
  if (limits.maxModules === null) return { allowed: true };

  const current = await prisma.module.count({ where: { tenantId } });
  if (current >= limits.maxModules) {
    return { allowed: false, code: "LIMIT_MODULES_REACHED", current, max: limits.maxModules };
  }
  return { allowed: true };
}
