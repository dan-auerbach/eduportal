"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getTenantContext } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import { CreateGroupSchema, UpdateGroupSchema } from "@/lib/validators";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// getGroups - list all groups with user count (scoped to tenant)
// ---------------------------------------------------------------------------
export async function getGroups(): Promise<ActionResult<unknown[]>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    const groups = await prisma.group.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true, modules: true } },
      },
    });

    return { success: true, data: groups };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju skupin" };
  }
}

// ---------------------------------------------------------------------------
// getGroup - get group with members (verify tenant ownership)
// ---------------------------------------------------------------------------
export async function getGroup(id: string): Promise<ActionResult<unknown>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                isActive: true,
                avatar: true,
              },
            },
          },
        },
        modules: {
          include: {
            module: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        },
        _count: { select: { users: true } },
      },
    });

    if (!group) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    // Verify group belongs to active tenant
    if (group.tenantId !== ctx.tenantId) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    return { success: true, data: group };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju skupine" };
  }
}

// ---------------------------------------------------------------------------
// createGroup - create group with validation (scoped to tenant)
// ---------------------------------------------------------------------------
export async function createGroup(
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    const parsed = CreateGroupSchema.parse(data);

    const group = await prisma.group.create({
      data: {
        ...parsed,
        tenantId: ctx.tenantId,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "GROUP_CREATED",
      entityType: "Group",
      entityId: group.id,
      tenantId: ctx.tenantId,
      metadata: { name: group.name },
    });

    return { success: true, data: { id: group.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju skupine" };
  }
}

// ---------------------------------------------------------------------------
// updateGroup - update group with validation (verify tenant ownership)
// ---------------------------------------------------------------------------
export async function updateGroup(
  id: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    const parsed = UpdateGroupSchema.parse(data);

    const existing = await prisma.group.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    // Verify group belongs to active tenant
    if (existing.tenantId !== ctx.tenantId) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    const group = await prisma.group.update({
      where: { id },
      data: parsed,
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "GROUP_UPDATED",
      entityType: "Group",
      entityId: group.id,
      tenantId: ctx.tenantId,
      metadata: { changes: parsed },
    });

    return { success: true, data: { id: group.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri posodabljanju skupine" };
  }
}

// ---------------------------------------------------------------------------
// deleteGroup - delete group (verify tenant ownership)
// ---------------------------------------------------------------------------
export async function deleteGroup(
  id: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    const existing = await prisma.group.findUnique({ where: { id } });
    if (!existing) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    // Verify group belongs to active tenant
    if (existing.tenantId !== ctx.tenantId) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    await prisma.group.delete({ where: { id } });

    await logAudit({
      actorId: ctx.user.id,
      action: "GROUP_UPDATED",
      entityType: "Group",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: { deleted: true, name: existing.name },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri brisanju skupine" };
  }
}

// ---------------------------------------------------------------------------
// addUserToGroup - add user to group (tenant-scoped)
// ---------------------------------------------------------------------------
export async function addUserToGroup(
  userId: string,
  groupId: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    const [user, group, userMembership] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
      }),
    ]);

    if (!user) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }
    if (!group) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    // Verify group belongs to active tenant
    if (group.tenantId !== ctx.tenantId) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    // Verify user has membership in this tenant
    if (!userMembership) {
      return { success: false, error: "Uporabnik ni član tega podjetja" };
    }

    await prisma.userGroup.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: { userId, groupId, tenantId: ctx.tenantId },
      update: {},
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri dodajanju uporabnika v skupino" };
  }
}

// ---------------------------------------------------------------------------
// removeUserFromGroup - remove user from group (verify tenant ownership)
// ---------------------------------------------------------------------------
export async function removeUserFromGroup(
  userId: string,
  groupId: string
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "MANAGE_GROUPS");

    // Verify group belongs to active tenant
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group || group.tenantId !== ctx.tenantId) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    const existing = await prisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (!existing) {
      return { success: false, error: "Uporabnik ni v tej skupini" };
    }

    await prisma.userGroup.delete({
      where: { userId_groupId: { userId, groupId } },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri odstranjevanju uporabnika iz skupine" };
  }
}
