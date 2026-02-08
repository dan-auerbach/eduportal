import { prisma } from "./prisma";
import { PermissionScopeSchema } from "./validators";
import type { Permission } from "@/generated/prisma/client";
import type { SessionUser } from "./auth";
import { hasMinRole } from "./tenant";

export class ForbiddenError extends Error {
  constructor(message = "Nimate potrebnih pravic") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Check if user has a specific permission within the active tenant.
 * OWNER and SUPER_ADMIN (tenant-level) bypass all permission checks.
 */
export async function requirePermission(
  user: SessionUser,
  capability: Permission,
  context?: { moduleId?: string; groupId?: string; tenantId?: string },
  fallback?: { permission: Permission; check: boolean }
): Promise<void> {
  const tenantId = context?.tenantId;

  // 1. OWNER → always OK
  if (user.role === "OWNER") return;

  // 2. Check tenant membership role — SUPER_ADMIN in tenant bypasses
  if (tenantId) {
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (membership && hasMinRole(membership.role, "SUPER_ADMIN")) return;
  } else {
    // Fallback: global role
    if (user.role === "SUPER_ADMIN") return;
  }

  // 3. Find UserPermission (scoped to tenant if available)
  const perm = tenantId
    ? await prisma.userPermission.findUnique({
        where: {
          userId_permission_tenantId: { userId: user.id, permission: capability, tenantId },
        },
      })
    : await prisma.userPermission.findFirst({
        where: { userId: user.id, permission: capability },
      });

  if (perm) {
    // 4. Validate scope
    const scope = perm.scope ? PermissionScopeSchema.parse(perm.scope) : null;

    // 5. Check scope restrictions
    if (scope?.groupIds && context?.groupId && !scope.groupIds.includes(context.groupId)) {
      throw new ForbiddenError("Nimate dostopa do te skupine");
    }
    if (scope?.moduleIds && context?.moduleId && !scope.moduleIds.includes(context.moduleId)) {
      throw new ForbiddenError("Nimate dostopa do tega modula");
    }
    return;
  }

  // 6. Fallback capability
  if (fallback?.check) {
    const fallbackPerm = tenantId
      ? await prisma.userPermission.findUnique({
          where: {
            userId_permission_tenantId: {
              userId: user.id,
              permission: fallback.permission,
              tenantId,
            },
          },
        })
      : await prisma.userPermission.findFirst({
          where: { userId: user.id, permission: fallback.permission },
        });
    if (fallbackPerm) return;
  }

  throw new ForbiddenError("Nimate potrebnih pravic");
}

export async function hasPermission(
  user: SessionUser,
  capability: Permission,
  context?: { moduleId?: string; groupId?: string; tenantId?: string }
): Promise<boolean> {
  try {
    await requirePermission(user, capability, context);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a user can access a specific module within a tenant.
 */
export async function checkModuleAccess(
  userId: string,
  moduleId: string,
  tenantId: string,
): Promise<boolean> {
  // C9: tenantId is now required to prevent cross-tenant access
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { groups: true, memberships: true },
  });
  if (!user) return false;

  // OWNER can access all modules
  if (user.role === "OWNER") return true;

  // Check tenant membership role
  const membership = user.memberships.find((m) => m.tenantId === tenantId);
  if (membership && hasMinRole(membership.role, "ADMIN")) return true;

  // Check if user is in a group assigned to this module (scoped to tenant)
  const moduleGroup = await prisma.moduleGroup.findFirst({
    where: {
      moduleId,
      tenantId,
      groupId: { in: user.groups.map((g) => g.groupId) },
    },
  });

  return !!moduleGroup;
}
