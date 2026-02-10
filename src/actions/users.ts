"use server";

import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getTenantContext, requireTenantRole } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import { checkUserLimit } from "@/lib/plan";
import { CreateUserSchema, UpdateUserSchema } from "@/lib/validators";
import type { ActionResult } from "@/types";
import { Prisma } from "@/generated/prisma/client";
import type { Permission, TenantRole } from "@/generated/prisma/client";

// ── Default permissions per role ───────────────────────────────────────────
// When a user is created or their role changes, grant these permissions
// automatically so they can actually access the admin pages their role allows.

const ROLE_DEFAULT_PERMISSIONS: Partial<Record<TenantRole, Permission[]>> = {
  ADMIN: [
    "MANAGE_OWN_MODULES",
    "VIEW_ALL_PROGRESS",
    "MANAGE_GROUPS",
    "MANAGE_QUIZZES",
    "VIEW_ANALYTICS",
  ],
  SUPER_ADMIN: [
    "MANAGE_ALL_MODULES",
    "MANAGE_OWN_MODULES",
    "VIEW_ALL_PROGRESS",
    "MANAGE_USERS",
    "MANAGE_GROUPS",
    "MANAGE_QUIZZES",
    "VIEW_ANALYTICS",
    "VIEW_AUDIT_LOG",
    "EXPORT_REPORTS",
  ],
};

/**
 * Sync UserPermission records for a user in a tenant based on their role.
 * Creates any missing permissions, does not remove extras.
 */
async function syncRolePermissions(
  userId: string,
  tenantId: string,
  role: TenantRole,
  grantedBy: string
): Promise<void> {
  const perms = ROLE_DEFAULT_PERMISSIONS[role];
  if (!perms || perms.length === 0) return;

  // Use createMany with skipDuplicates to avoid conflicts
  await prisma.userPermission.createMany({
    data: perms.map((p) => ({
      userId,
      tenantId,
      permission: p,
      grantedBy,
    })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------------------
// getUsers - list users with optional search (requires MANAGE_USERS)
// Scoped to current tenant via Membership
// ---------------------------------------------------------------------------
export async function getUsers(search?: string): Promise<ActionResult<Awaited<ReturnType<typeof prisma.user.findMany>>>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    const searchFilter = search
      ? {
          user: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" as const } },
              { lastName: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
            deletedAt: null,
          },
        }
      : { user: { deletedAt: null } };

    const memberships = await prisma.membership.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...searchFilter,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
            avatar: true,
          },
        },
      },
      orderBy: { user: { createdAt: "desc" } },
    });

    const users = memberships.map((m) => m.user);

    return { success: true, data: users as never };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju uporabnikov" };
  }
}

// ---------------------------------------------------------------------------
// getUser - get single user by id (verify membership in active tenant)
// ---------------------------------------------------------------------------
export async function getUser(id: string): Promise<ActionResult<NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    // Verify user has membership in active tenant
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
    });

    if (!membership) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        groups: { include: { group: true } },
        permissions: {
          where: { tenantId: ctx.tenantId },
        },
      },
    });

    if (!user) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    return { success: true, data: user as never };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju uporabnika" };
  }
}

// ---------------------------------------------------------------------------
// createUser - create user globally + create Membership in active tenant
// ---------------------------------------------------------------------------
export async function createUser(
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    // Plan limit check
    const limitCheck = await checkUserLimit(ctx.tenantId, ctx.tenantPlan);
    if (!limitCheck.allowed) {
      return { success: false, error: "LIMIT_USERS_REACHED" };
    }

    const parsed = CreateUserSchema.parse(data);
    const passwordHash = await hash(parsed.password, 12);

    const user = await prisma.user.create({
      data: {
        email: parsed.email,
        passwordHash,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        role: parsed.role,
      },
    });

    // Create membership in the active tenant (mirror the selected role)
    await prisma.membership.create({
      data: {
        userId: user.id,
        tenantId: ctx.tenantId,
        role: parsed.role,
      },
    });

    // Auto-grant default permissions for the assigned role
    await syncRolePermissions(user.id, ctx.tenantId, parsed.role as TenantRole, ctx.user.id);

    // Assign to groups if provided
    if (parsed.groupIds && parsed.groupIds.length > 0) {
      await prisma.userGroup.createMany({
        data: parsed.groupIds.map((groupId: string) => ({
          userId: user.id,
          groupId,
          tenantId: ctx.tenantId,
        })),
        skipDuplicates: true,
      });
    }

    await logAudit({
      actorId: ctx.user.id,
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      tenantId: ctx.tenantId,
      metadata: { email: user.email, role: user.role, groupIds: parsed.groupIds },
    });

    return { success: true, data: { id: user.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju uporabnika" };
  }
}

// ---------------------------------------------------------------------------
// updateUser - update user with validation, audit log (verify tenant membership)
// ---------------------------------------------------------------------------
export async function updateUser(
  id: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    const parsed = UpdateUserSchema.parse(data);

    // Verify membership in tenant
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
    });

    if (!membership) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    const user = await prisma.user.update({
      where: { id },
      data: parsed,
    });

    // Sync role change to tenant membership so effectiveRole matches
    if (parsed.role) {
      await prisma.membership.update({
        where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
        data: { role: parsed.role },
      });

      // Auto-grant default permissions for the new role
      await syncRolePermissions(id, ctx.tenantId, parsed.role as TenantRole, ctx.user.id);
    }

    await logAudit({
      actorId: ctx.user.id,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: user.id,
      tenantId: ctx.tenantId,
      metadata: { changes: parsed },
    });

    return { success: true, data: { id: user.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri posodabljanju uporabnika" };
  }
}

// ---------------------------------------------------------------------------
// deactivateUser - remove membership from tenant (or deactivate user if OWNER)
// ---------------------------------------------------------------------------
export async function deactivateUser(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
    });

    if (!membership) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    if (ctx.effectiveRole === "OWNER") {
      // OWNER can fully deactivate the user
      const user = await prisma.user.update({
        where: { id },
        data: { isActive: false, deletedAt: new Date() },
      });

      await logAudit({
        actorId: ctx.user.id,
        action: "USER_DEACTIVATED",
        entityType: "User",
        entityId: user.id,
        tenantId: ctx.tenantId,
        metadata: { email: user.email },
      });
    } else {
      // Non-owner: remove membership from tenant
      await prisma.membership.delete({
        where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
      });

      await logAudit({
        actorId: ctx.user.id,
        action: "USER_DEACTIVATED",
        entityType: "Membership",
        entityId: id,
        tenantId: ctx.tenantId,
        metadata: { removedFromTenant: ctx.tenantId },
      });
    }

    return { success: true, data: { id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri deaktivaciji uporabnika" };
  }
}

// ---------------------------------------------------------------------------
// resetUserPassword - generate a temporary password for user (verify membership)
// ---------------------------------------------------------------------------
export async function resetUserPassword(
  id: string
): Promise<ActionResult<{ temporaryPassword: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    // Verify membership in tenant
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
    });

    if (!membership) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    // Generate a cryptographically secure temporary password (12 chars, alphanumeric)
    const { randomBytes } = await import("crypto");
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const bytes = randomBytes(12);
    let temporaryPassword = "";
    for (let i = 0; i < 12; i++) {
      temporaryPassword += chars.charAt(bytes[i] % chars.length);
    }

    const passwordHash = await hash(temporaryPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "USER_PASSWORD_RESET",
      entityType: "User",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: { email: existing.email },
    });

    return { success: true, data: { temporaryPassword } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ponastavitvi gesla" };
  }
}

// ---------------------------------------------------------------------------
// grantPermission - grant permission to user (tenant-scoped)
// ---------------------------------------------------------------------------
export async function grantPermission(
  userId: string,
  permission: Permission,
  scope?: Prisma.InputJsonValue
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    // Verify user has membership in tenant
    const membership = await prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
    });

    if (!membership) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }

    const scopeValue = scope ?? Prisma.JsonNull;
    const perm = await prisma.userPermission.upsert({
      where: {
        userId_permission_tenantId: { userId, permission, tenantId: ctx.tenantId },
      },
      create: {
        userId,
        permission,
        tenantId: ctx.tenantId,
        scope: scopeValue,
        grantedBy: ctx.user.id,
      },
      update: {
        scope: scopeValue,
        grantedBy: ctx.user.id,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "PERMISSION_GRANTED",
      entityType: "UserPermission",
      entityId: perm.id,
      tenantId: ctx.tenantId,
      metadata: { userId, permission, scope },
    });

    return { success: true, data: { id: perm.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri dodeljevanju dovoljenja" };
  }
}

// ---------------------------------------------------------------------------
// revokePermission - revoke permission from user (tenant-scoped)
// ---------------------------------------------------------------------------
export async function revokePermission(
  userId: string,
  permission: Permission
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_USERS");

    const existing = await prisma.userPermission.findUnique({
      where: {
        userId_permission_tenantId: { userId, permission, tenantId: ctx.tenantId },
      },
    });

    if (!existing) {
      return { success: false, error: "Dovoljenje ne obstaja" };
    }

    await prisma.userPermission.delete({
      where: {
        userId_permission_tenantId: { userId, permission, tenantId: ctx.tenantId },
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "PERMISSION_REVOKED",
      entityType: "UserPermission",
      entityId: existing.id,
      tenantId: ctx.tenantId,
      metadata: { userId, permission },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri odvzemu dovoljenja" };
  }
}
