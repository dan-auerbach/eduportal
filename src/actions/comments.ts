"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { getTenantContext, hasMinRole } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import { CreateCommentSchema } from "@/lib/validators";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// getComments - get threaded comments for a module (tenant-scoped)
// ---------------------------------------------------------------------------
export async function getComments(
  moduleId: string
): Promise<ActionResult<unknown[]>> {
  try {
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, tenantId: true },
    });

    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Verify module belongs to active tenant
    if (module.tenantId !== ctx.tenantId) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Fetch top-level comments with their replies, scoped to tenant
    const comments = await prisma.comment.findMany({
      where: { moduleId, parentId: null, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
          },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return { success: true, data: comments };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju komentarjev" };
  }
}

// ---------------------------------------------------------------------------
// createComment - create comment with validation (tenant-scoped)
// ---------------------------------------------------------------------------
export async function createComment(
  moduleId: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({
      where: { id: moduleId },
      select: { id: true, tenantId: true },
    });

    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Verify module belongs to active tenant
    if (module.tenantId !== ctx.tenantId) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const parsed = CreateCommentSchema.parse(data);

    // If parentId is provided, verify it exists and belongs to the same module
    if (parsed.parentId) {
      const parentComment = await prisma.comment.findUnique({
        where: { id: parsed.parentId },
        select: { moduleId: true, tenantId: true },
      });

      if (!parentComment) {
        return { success: false, error: "Nadrejni komentar ne obstaja" };
      }

      if (parentComment.moduleId !== moduleId) {
        return { success: false, error: "Nadrejni komentar ne pripada temu modulu" };
      }

      if (parentComment.tenantId !== ctx.tenantId) {
        return { success: false, error: "Nadrejni komentar ne obstaja" };
      }
    }

    const comment = await prisma.comment.create({
      data: {
        moduleId,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        content: parsed.content,
        parentId: parsed.parentId ?? null,
      },
    });

    return { success: true, data: { id: comment.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju komentarja" };
  }
}

// ---------------------------------------------------------------------------
// resolveComment - mark comment as resolved (admin only, verify tenant)
// ---------------------------------------------------------------------------
export async function resolveComment(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();

    // Only admins (by tenant role) can resolve comments
    if (!hasMinRole(ctx.effectiveRole, "ADMIN")) {
      await requirePermission(ctx.user, "MANAGE_ALL_MODULES");
    }

    const comment = await prisma.comment.findUnique({
      where: { id },
    });

    if (!comment) {
      return { success: false, error: "Komentar ne obstaja" };
    }

    // Verify comment belongs to active tenant
    if (comment.tenantId !== ctx.tenantId) {
      return { success: false, error: "Komentar ne obstaja" };
    }

    await prisma.comment.update({
      where: { id },
      data: { isResolved: true },
    });

    return { success: true, data: { id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri razreševanju komentarja" };
  }
}
