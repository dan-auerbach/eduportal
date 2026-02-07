"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { CreateCategorySchema, UpdateCategorySchema, ReorderCategoriesSchema } from "@/lib/validators";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// getCategories - list all categories for the current tenant
// ---------------------------------------------------------------------------
export async function getCategories(): Promise<
  ActionResult<{ id: string; name: string; sortOrder: number; _count: { modules: number } }[]>
> {
  try {
    const ctx = await getTenantContext();
    const categories = await prisma.moduleCategory.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        sortOrder: true,
        _count: { select: { modules: true } },
      },
    });
    return { success: true, data: categories };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch categories" };
  }
}

// ---------------------------------------------------------------------------
// createCategory
// ---------------------------------------------------------------------------
export async function createCategory(
  data: { name: string; sortOrder?: number }
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES");

    const parsed = CreateCategorySchema.parse(data);

    // Auto-assign sort order if not provided
    let sortOrder = parsed.sortOrder;
    if (sortOrder === 0) {
      const maxSort = await prisma.moduleCategory.aggregate({
        where: { tenantId: ctx.tenantId },
        _max: { sortOrder: true },
      });
      sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    }

    const category = await prisma.moduleCategory.create({
      data: {
        name: parsed.name,
        sortOrder,
        tenantId: ctx.tenantId,
      },
    });

    return { success: true, data: { id: category.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Failed to create category" };
  }
}

// ---------------------------------------------------------------------------
// updateCategory
// ---------------------------------------------------------------------------
export async function updateCategory(
  id: string,
  data: { name?: string; sortOrder?: number }
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES");

    const parsed = UpdateCategorySchema.parse(data);

    const category = await prisma.moduleCategory.update({
      where: { id, tenantId: ctx.tenantId },
      data: parsed,
    });

    return { success: true, data: { id: category.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Failed to update category" };
  }
}

// ---------------------------------------------------------------------------
// deleteCategory (modules get categoryId = null via SetNull FK)
// ---------------------------------------------------------------------------
export async function deleteCategory(id: string): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES");

    await prisma.moduleCategory.delete({
      where: { id, tenantId: ctx.tenantId },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete category" };
  }
}

// ---------------------------------------------------------------------------
// reorderCategories - set sortOrder based on array index
// ---------------------------------------------------------------------------
export async function reorderCategories(
  categoryIds: string[]
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES");

    const parsed = ReorderCategoriesSchema.parse(categoryIds);

    await prisma.$transaction(
      parsed.map((id, index) =>
        prisma.moduleCategory.update({
          where: { id, tenantId: ctx.tenantId },
          data: { sortOrder: index },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Failed to reorder categories" };
  }
}
