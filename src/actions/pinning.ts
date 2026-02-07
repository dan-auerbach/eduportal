"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// toggleUserPin - employee pins/unpins a module for themselves
// ---------------------------------------------------------------------------
export async function toggleUserPin(
  moduleId: string
): Promise<ActionResult<{ pinned: boolean }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    // Verify module exists and is published in this tenant
    const moduleExists = await prisma.module.findFirst({
      where: { id: moduleId, tenantId: ctx.tenantId, status: "PUBLISHED" },
      select: { id: true },
    });

    if (!moduleExists) {
      return { success: false, error: "Module not found" };
    }

    const existing = await prisma.userPinnedModule.findUnique({
      where: { userId_moduleId: { userId: currentUser.id, moduleId } },
    });

    if (existing) {
      await prisma.userPinnedModule.delete({
        where: { userId_moduleId: { userId: currentUser.id, moduleId } },
      });
      return { success: true, data: { pinned: false } };
    }

    await prisma.userPinnedModule.create({
      data: { userId: currentUser.id, moduleId },
    });
    return { success: true, data: { pinned: true } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to toggle pin" };
  }
}

// ---------------------------------------------------------------------------
// toggleCompanyPin - admin pins/unpins a module for the entire company
// ---------------------------------------------------------------------------
export async function toggleCompanyPin(
  moduleId: string
): Promise<ActionResult<{ pinned: boolean }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES");

    // Verify module exists in this tenant
    const moduleExists = await prisma.module.findFirst({
      where: { id: moduleId, tenantId: ctx.tenantId },
      select: { id: true },
    });

    if (!moduleExists) {
      return { success: false, error: "Module not found" };
    }

    const existing = await prisma.companyPinnedModule.findUnique({
      where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId } },
    });

    if (existing) {
      await prisma.companyPinnedModule.delete({
        where: { tenantId_moduleId: { tenantId: ctx.tenantId, moduleId } },
      });
      return { success: true, data: { pinned: false } };
    }

    await prisma.companyPinnedModule.create({
      data: {
        tenantId: ctx.tenantId,
        moduleId,
        pinnedById: currentUser.id,
      },
    });
    return { success: true, data: { pinned: true } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Failed to toggle company pin" };
  }
}
