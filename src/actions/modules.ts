"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, hasPermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getTenantContext } from "@/lib/tenant";
import { checkModuleLimit } from "@/lib/plan";
import { validateSectionUnlockChain } from "@/lib/section-unlock";
import { sanitizeHtml } from "@/lib/sanitize";
import { t, setLocale } from "@/lib/i18n";
import {
  CreateModuleSchema,
  UpdateModuleSchema,
  CreateSectionSchema,
  UpdateSectionSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/types";
import type { ModuleStatus } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// getModules - list modules (admins see all, employees see assigned published)
// ---------------------------------------------------------------------------
export async function getModules(
  status?: ModuleStatus
): Promise<ActionResult<unknown[]>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    const isAdmin =
      currentUser.role === "SUPER_ADMIN" ||
      currentUser.role === "ADMIN" ||
      (await hasPermission(currentUser, "MANAGE_ALL_MODULES"));

    if (isAdmin) {
      const modules = await prisma.module.findMany({
        where: status ? { status, tenantId: ctx.tenantId } : { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          tags: { include: { tag: true } },
          _count: { select: { sections: true, groups: true } },
        },
      });
      return { success: true, data: modules };
    }

    // Employee: only see published modules assigned to their groups
    const userGroups = await prisma.userGroup.findMany({
      where: { userId: currentUser.id },
      select: { groupId: true },
    });
    const groupIds = userGroups.map((ug) => ug.groupId);

    const modules = await prisma.module.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "PUBLISHED",
        groups: {
          some: { groupId: { in: groupIds } },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        tags: { include: { tag: true } },
        _count: { select: { sections: true } },
      },
    });

    return { success: true, data: modules };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju modulov" };
  }
}

// ---------------------------------------------------------------------------
// getModule - get module with sections, tags
// ---------------------------------------------------------------------------
export async function getModule(
  id: string
): Promise<ActionResult<unknown>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({
      where: { id, tenantId: ctx.tenantId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        sections: {
          orderBy: { sortOrder: "asc" },
          include: {
            attachments: {
              select: { id: true, fileName: true, mimeType: true, fileSize: true, storagePath: true },
            },
            _count: { select: { completions: true } },
          },
        },
        tags: { include: { tag: true } },
        groups: {
          include: {
            group: { select: { id: true, name: true, color: true } },
          },
        },
        quizzes: {
          orderBy: { sortOrder: "asc" },
          include: { _count: { select: { questions: true } } },
        },
        _count: { select: { sections: true, comments: true, certificates: true } },
      },
    });

    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Non-admin employees can only see published modules assigned to their groups
    const isAdmin =
      currentUser.role === "SUPER_ADMIN" ||
      currentUser.role === "ADMIN" ||
      (await hasPermission(currentUser, "MANAGE_ALL_MODULES"));

    if (!isAdmin && module.status !== "PUBLISHED") {
      // Allow if user is the creator and has MANAGE_OWN_MODULES
      if (
        module.createdById !== currentUser.id ||
        !(await hasPermission(currentUser, "MANAGE_OWN_MODULES"))
      ) {
        return { success: false, error: "Nimate dostopa do tega modula" };
      }
    }

    return { success: true, data: module };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju modula" };
  }
}

// ---------------------------------------------------------------------------
// createModule - create module with validation
// ---------------------------------------------------------------------------
export async function createModule(
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_OWN_MODULES", undefined, {
      permission: "MANAGE_ALL_MODULES",
      check: true,
    });

    // Plan limit check
    const limitCheck = await checkModuleLimit(ctx.tenantId, ctx.tenantPlan);
    if (!limitCheck.allowed) {
      return { success: false, error: "LIMIT_MODULES_REACHED" };
    }

    const parsed = CreateModuleSchema.parse(data);

    const module = await prisma.module.create({
      data: {
        ...parsed,
        tenantId: ctx.tenantId,
        createdById: currentUser.id,
      },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_CREATED",
      entityType: "Module",
      entityId: module.id,
      tenantId: ctx.tenantId,
      metadata: { title: module.title },
    });

    return { success: true, data: { id: module.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju modula" };
  }
}

// ---------------------------------------------------------------------------
// updateModule - update module with validation + version bump for published
// ---------------------------------------------------------------------------
export async function updateModule(
  id: string,
  data: unknown,
  changeSummary?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    setLocale(ctx.tenantLocale);

    const existing = await prisma.module.findUnique({ where: { id, tenantId: ctx.tenantId } });
    if (!existing) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Check permissions: MANAGE_ALL_MODULES or own module with MANAGE_OWN_MODULES
    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const parsed = UpdateModuleSchema.parse(data);

    // If module is PUBLISHED and changeSummary provided, bump version
    if (existing.status === "PUBLISHED" && changeSummary) {
      const newVersion = existing.version + 1;

      // Get all assigned user IDs for notifications
      const assignedUsers = await prisma.moduleGroup.findMany({
        where: { moduleId: id },
        include: {
          group: {
            include: {
              users: { select: { userId: true } },
            },
          },
        },
      });

      const userIds = new Set<string>();
      for (const mg of assignedUsers) {
        for (const ug of mg.group.users) {
          userIds.add(ug.userId);
        }
      }

      // Transaction: update module + create change log + send notifications
      await prisma.$transaction([
        prisma.module.update({
          where: { id },
          data: { ...parsed, version: newVersion },
        }),
        prisma.moduleChangeLog.create({
          data: {
            moduleId: id,
            version: newVersion,
            changeSummary,
            changedById: currentUser.id,
            tenantId: ctx.tenantId,
          },
        }),
        // Create notifications for all assigned users
        ...Array.from(userIds).map((userId) =>
          prisma.notification.create({
            data: {
              userId,
              type: "MODULE_UPDATED",
              title: t("notifications.moduleUpdatedTitle", { title: existing.title }),
              message: t("notifications.moduleUpdatedMessage"),
              link: `/modules/${id}`,
              tenantId: ctx.tenantId,
            },
          })
        ),
      ]);

      await logAudit({
        actorId: currentUser.id,
        action: "MODULE_VERSION_BUMPED",
        entityType: "Module",
        entityId: id,
        tenantId: ctx.tenantId,
        metadata: { changes: parsed, version: newVersion, changeSummary },
      });
    } else {
      // Regular update without version bump
      await prisma.module.update({
        where: { id },
        data: parsed,
      });

      await logAudit({
        actorId: currentUser.id,
        action: "MODULE_UPDATED",
        entityType: "Module",
        entityId: id,
        tenantId: ctx.tenantId,
        metadata: { changes: parsed },
      });
    }

    return { success: true, data: { id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri posodabljanju modula" };
  }
}

// ---------------------------------------------------------------------------
// publishModule - set status to PUBLISHED, publishedAt = now()
// ---------------------------------------------------------------------------
export async function publishModule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.module.findUnique({ where: { id, tenantId: ctx.tenantId } });
    if (!existing) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za objavo tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const module = await prisma.module.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_PUBLISHED",
      entityType: "Module",
      entityId: module.id,
      tenantId: ctx.tenantId,
      metadata: { title: module.title },
    });

    // Fire-and-forget: send instant knowledge notification to users with INSTANT preference
    void import("@/actions/email").then(({ sendKnowledgeInstantNotification }) =>
      sendKnowledgeInstantNotification({
        moduleId: module.id,
        moduleTitle: module.title,
        tenantId: ctx.tenantId,
      }),
    );

    return { success: true, data: { id: module.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri objavi modula" };
  }
}

// ---------------------------------------------------------------------------
// archiveModule - set status to ARCHIVED
// ---------------------------------------------------------------------------
export async function archiveModule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.module.findUnique({ where: { id, tenantId: ctx.tenantId } });
    if (!existing) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za arhiviranje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const module = await prisma.module.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_ARCHIVED",
      entityType: "Module",
      entityId: module.id,
      tenantId: ctx.tenantId,
      metadata: { title: module.title },
    });

    return { success: true, data: { id: module.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri arhiviranju modula" };
  }
}

// ---------------------------------------------------------------------------
// assignModuleToGroup - assign module to group with optional deadline
// ---------------------------------------------------------------------------
export async function assignModuleToGroup(
  moduleId: string,
  groupId: string,
  deadlineDays?: number,
  isMandatory?: boolean
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES", { moduleId }, {
      permission: "MANAGE_OWN_MODULES",
      check: true,
    });

    const [module, group] = await Promise.all([
      prisma.module.findUnique({ where: { id: moduleId, tenantId: ctx.tenantId } }),
      prisma.group.findUnique({ where: { id: groupId } }),
    ]);

    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }
    if (!group) {
      return { success: false, error: "Skupina ne obstaja" };
    }

    await prisma.moduleGroup.upsert({
      where: { moduleId_groupId: { moduleId, groupId } },
      create: {
        moduleId,
        groupId,
        tenantId: ctx.tenantId,
        deadlineDays: deadlineDays ?? null,
        isMandatory: isMandatory ?? false,
      },
      update: {
        deadlineDays: deadlineDays ?? null,
        isMandatory: isMandatory ?? false,
      },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_ASSIGNED",
      entityType: "ModuleGroup",
      entityId: `${moduleId}_${groupId}`,
      tenantId: ctx.tenantId,
      metadata: { moduleId, groupId, deadlineDays, isMandatory },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri dodeljevanju modula skupini" };
  }
}

// ---------------------------------------------------------------------------
// removeModuleFromGroup - remove module assignment from group
// ---------------------------------------------------------------------------
export async function removeModuleFromGroup(
  moduleId: string,
  groupId: string
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_ALL_MODULES", { moduleId }, {
      permission: "MANAGE_OWN_MODULES",
      check: true,
    });

    const existing = await prisma.moduleGroup.findUnique({
      where: { moduleId_groupId: { moduleId, groupId } },
    });

    if (!existing) {
      return { success: false, error: "Dodelitev ne obstaja" };
    }

    await prisma.moduleGroup.delete({
      where: { moduleId_groupId: { moduleId, groupId } },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri odstranitvi dodelitve" };
  }
}

// ---------------------------------------------------------------------------
// createSection - create section, auto-set sortOrder
// ---------------------------------------------------------------------------
export async function createSection(
  moduleId: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({ where: { id: moduleId, tenantId: ctx.tenantId } });
    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const parsed = CreateSectionSchema.parse(data);

    // Sanitize HTML content to prevent stored XSS
    if (parsed.content) {
      parsed.content = sanitizeHtml(parsed.content);
    }

    // Auto-set sortOrder to be last
    const maxSort = await prisma.section.aggregate({
      where: { moduleId },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const section = await prisma.section.create({
      data: {
        ...parsed,
        tenantId: ctx.tenantId,
        moduleId,
        sortOrder: nextOrder,
      },
    });

    return { success: true, data: { id: section.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju sekcije" };
  }
}

// ---------------------------------------------------------------------------
// updateSection - update section, validate unlock chain
// ---------------------------------------------------------------------------
export async function updateSection(
  id: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.section.findUnique({
      where: { id, tenantId: ctx.tenantId },
      include: { module: true },
    });
    if (!existing) {
      return { success: false, error: "Sekcija ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const parsed = UpdateSectionSchema.parse(data);

    // Sanitize HTML content to prevent stored XSS
    if (parsed.content) {
      parsed.content = sanitizeHtml(parsed.content);
    }

    // If unlockAfterSectionId is being changed, validate the chain
    if (parsed.unlockAfterSectionId !== undefined) {
      const allSections = await prisma.section.findMany({
        where: { moduleId: existing.moduleId },
        select: { id: true, unlockAfterSectionId: true },
      });

      // Simulate the change
      const simulatedSections = allSections.map((s) =>
        s.id === id
          ? { ...s, unlockAfterSectionId: parsed.unlockAfterSectionId ?? null }
          : s
      );

      const validation = validateSectionUnlockChain(simulatedSections);
      if (!validation.valid) {
        return { success: false, error: validation.error! };
      }
    }

    const section = await prisma.section.update({
      where: { id },
      data: parsed,
    });

    return { success: true, data: { id: section.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri posodabljanju sekcije" };
  }
}

// ---------------------------------------------------------------------------
// deleteSection - delete section
// ---------------------------------------------------------------------------
export async function deleteSection(
  id: string
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.section.findUnique({
      where: { id, tenantId: ctx.tenantId },
      include: { module: true },
    });
    if (!existing) {
      return { success: false, error: "Sekcija ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    // Clean up Cloudflare Stream video if exists
    if (existing.cloudflareStreamUid) {
      try {
        const { deleteCloudflareStreamVideo } = await import("@/lib/cloudflare-stream");
        await deleteCloudflareStreamVideo(existing.cloudflareStreamUid);
      } catch {
        // Ignore CF deletion errors
      }
    }

    // Clean up legacy video blob if exists
    if (existing.videoBlobUrl) {
      try {
        const { del } = await import("@vercel/blob");
        await del(existing.videoBlobUrl);
      } catch {
        // Ignore blob deletion errors
      }
    }

    // Clear any references to this section in unlockAfterSectionId
    await prisma.section.updateMany({
      where: { unlockAfterSectionId: id, tenantId: ctx.tenantId },
      data: { unlockAfterSectionId: null },
    });

    await prisma.section.delete({ where: { id } });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri brisanju sekcije" };
  }
}

// ---------------------------------------------------------------------------
// duplicateSection - duplicate a section within the same module
// ---------------------------------------------------------------------------
export async function duplicateSection(
  sectionId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { module: true },
    });
    if (!existing) {
      return { success: false, error: "Sekcija ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    // Get next sortOrder
    const maxSort = await prisma.section.aggregate({
      where: { moduleId: existing.moduleId },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const newSection = await prisma.section.create({
      data: {
        moduleId: existing.moduleId,
        tenantId: ctx.tenantId,
        title: `${existing.title} (kopija)`,
        content: existing.content,
        type: existing.type,
        sortOrder: nextOrder,
        unlockAfterSectionId: null,
        // Copy video source type but NOT blob data (duplicate won't share video file)
        videoSourceType: existing.videoSourceType,
      },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Section",
      entityId: newSection.id,
      tenantId: ctx.tenantId,
      metadata: { duplicatedFrom: sectionId, newSectionId: newSection.id },
    });

    return { success: true, data: { id: newSection.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri podvajanju sekcije" };
  }
}

// ---------------------------------------------------------------------------
// duplicateModule - duplicate a module with its sections (without attachments)
// ---------------------------------------------------------------------------
export async function duplicateModule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.module.findUnique({
      where: { id, tenantId: ctx.tenantId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          select: {
            title: true,
            content: true,
            sortOrder: true,
            type: true,
            unlockAfterSectionId: true,
          },
        },
        tags: { include: { tag: true } },
      },
    });

    if (!existing) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za podvajanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    // Create the duplicate module
    const newModule = await prisma.module.create({
      data: {
        title: `${existing.title} (kopija)`,
        description: existing.description,
        coverImage: existing.coverImage,
        status: "DRAFT",
        difficulty: existing.difficulty,
        estimatedTime: existing.estimatedTime,
        isMandatory: existing.isMandatory,
        categoryId: existing.categoryId,
        tenantId: ctx.tenantId,
        createdById: currentUser.id,
      },
    });

    // Map old section IDs to new section IDs for unlock chain
    const sectionIdMap = new Map<string, string>();

    // First pass: create sections without unlock dependencies
    for (const section of existing.sections) {
      const newSection = await prisma.section.create({
        data: {
          moduleId: newModule.id,
          tenantId: ctx.tenantId,
          title: section.title,
          content: section.content,
          sortOrder: section.sortOrder,
          type: section.type,
          unlockAfterSectionId: null,
        },
      });
      // We need to find the original section ID to map
      // Since we only have the section data, we need to fetch original IDs
      sectionIdMap.set(section.title + section.sortOrder, newSection.id);
    }

    // Re-fetch original sections with IDs for proper mapping
    const originalSections = await prisma.section.findMany({
      where: { moduleId: id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, title: true, sortOrder: true, unlockAfterSectionId: true },
    });

    const newSections = await prisma.section.findMany({
      where: { moduleId: newModule.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });

    // Build proper ID mapping (by sortOrder which is preserved)
    const oldToNewIdMap = new Map<string, string>();
    for (const origSection of originalSections) {
      const newSection = newSections.find(s => s.sortOrder === origSection.sortOrder);
      if (newSection) {
        oldToNewIdMap.set(origSection.id, newSection.id);
      }
    }

    // Second pass: set unlock dependencies
    for (const origSection of originalSections) {
      if (origSection.unlockAfterSectionId) {
        const newSectionId = oldToNewIdMap.get(origSection.id);
        const newUnlockId = oldToNewIdMap.get(origSection.unlockAfterSectionId);
        if (newSectionId && newUnlockId) {
          await prisma.section.update({
            where: { id: newSectionId },
            data: { unlockAfterSectionId: newUnlockId },
          });
        }
      }
    }

    // Copy tags
    for (const mt of existing.tags) {
      await prisma.moduleTag.create({
        data: {
          moduleId: newModule.id,
          tagId: mt.tag.id,
          tenantId: ctx.tenantId,
        },
      });
    }

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_CREATED",
      entityType: "Module",
      entityId: newModule.id,
      tenantId: ctx.tenantId,
      metadata: { title: newModule.title, duplicatedFrom: id },
    });

    return { success: true, data: { id: newModule.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri podvajanju modula" };
  }
}

// ---------------------------------------------------------------------------
// unpublishModule - set status back to DRAFT
// ---------------------------------------------------------------------------
export async function unpublishModule(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.module.findUnique({ where: { id, tenantId: ctx.tenantId } });
    if (!existing) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za skrivanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const module = await prisma.module.update({
      where: { id },
      data: {
        status: "DRAFT",
        publishedAt: null,
      },
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: module.id,
      tenantId: ctx.tenantId,
      metadata: { title: module.title, action: "unpublished" },
    });

    return { success: true, data: { id: module.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri skrivanju modula" };
  }
}

// ---------------------------------------------------------------------------
// createQuiz - create a quiz for a module
// ---------------------------------------------------------------------------
export async function createQuiz(
  moduleId: string,
  data: {
    title: string;
    passingScore?: number;
    maxAttempts?: number;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({ where: { id: moduleId, tenantId: ctx.tenantId } });
    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const maxSort = await prisma.quiz.aggregate({
      where: { moduleId },
      _max: { sortOrder: true },
    });
    const nextOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const quiz = await prisma.quiz.create({
      data: {
        moduleId,
        tenantId: ctx.tenantId,
        title: data.title,
        passingScore: data.passingScore ?? 70,
        maxAttempts: data.maxAttempts ?? 3,
        sortOrder: nextOrder,
      },
    });

    return { success: true, data: { id: quiz.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju kviza" };
  }
}

// ---------------------------------------------------------------------------
// updateQuiz - update quiz metadata
// ---------------------------------------------------------------------------
export async function updateQuiz(
  quizId: string,
  data: {
    title?: string;
    passingScore?: number;
    maxAttempts?: number;
  }
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId, tenantId: ctx.tenantId },
      include: { module: true },
    });
    if (!quiz) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (quiz.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega kviza");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    await prisma.quiz.update({
      where: { id: quizId },
      data,
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri posodabljanju kviza" };
  }
}

// ---------------------------------------------------------------------------
// deleteQuiz - delete a quiz and its questions
// ---------------------------------------------------------------------------
export async function deleteQuiz(
  quizId: string
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId, tenantId: ctx.tenantId },
      include: { module: true },
    });
    if (!quiz) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (quiz.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za brisanje tega kviza");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    await prisma.quiz.delete({ where: { id: quizId } });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri brisanju kviza" };
  }
}

// ---------------------------------------------------------------------------
// saveQuizQuestion - create or update a quiz question
// ---------------------------------------------------------------------------
export async function saveQuizQuestion(
  quizId: string,
  data: {
    id?: string;
    question: string;
    options: { text: string; isCorrect: boolean }[];
    sortOrder?: number;
  }
): Promise<ActionResult<{ id: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId, tenantId: ctx.tenantId },
      include: { module: true },
    });
    if (!quiz) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (quiz.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega kviza");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    const correctCount = data.options.filter(o => o.isCorrect).length;
    const questionType = correctCount > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";

    if (data.id) {
      await prisma.quizQuestion.update({
        where: { id: data.id },
        data: {
          question: data.question,
          options: data.options,
          type: questionType,
          sortOrder: data.sortOrder,
        },
      });
      return { success: true, data: { id: data.id } };
    } else {
      const maxSort = await prisma.quizQuestion.aggregate({
        where: { quizId },
        _max: { sortOrder: true },
      });
      const nextOrder = (maxSort._max.sortOrder ?? -1) + 1;

      const question = await prisma.quizQuestion.create({
        data: {
          quizId,
          tenantId: ctx.tenantId,
          question: data.question,
          options: data.options,
          type: questionType,
          sortOrder: data.sortOrder ?? nextOrder,
        },
      });
      return { success: true, data: { id: question.id } };
    }
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri shranjevanju vprašanja" };
  }
}

// ---------------------------------------------------------------------------
// deleteQuizQuestion - delete a quiz question
// ---------------------------------------------------------------------------
export async function deleteQuizQuestion(
  questionId: string
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const question = await prisma.quizQuestion.findUnique({
      where: { id: questionId, tenantId: ctx.tenantId },
      include: { quiz: { include: { module: true } } },
    });
    if (!question) {
      return { success: false, error: "Vprašanje ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (question.quiz.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za brisanje tega vprašanja");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    await prisma.quizQuestion.delete({ where: { id: questionId } });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri brisanju vprašanja" };
  }
}

// ---------------------------------------------------------------------------
// reorderSections - reorder sections by providing ordered array of IDs
// ---------------------------------------------------------------------------
export async function reorderSections(
  moduleId: string,
  sectionIds: string[]
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({ where: { id: moduleId, tenantId: ctx.tenantId } });
    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    // Verify all section IDs belong to this module
    const sections = await prisma.section.findMany({
      where: { moduleId },
      select: { id: true },
    });
    const existingIds = new Set(sections.map((s) => s.id));

    for (const sid of sectionIds) {
      if (!existingIds.has(sid)) {
        return { success: false, error: `Sekcija ${sid} ne pripada temu modulu` };
      }
    }

    // Update sort orders in a transaction
    await prisma.$transaction(
      sectionIds.map((sectionId, index) =>
        prisma.section.update({
          where: { id: sectionId },
          data: { sortOrder: index },
        })
      )
    );

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri preurejanju sekcij" };
  }
}

// ---------------------------------------------------------------------------
// acknowledgeModuleUpdate - mark module update as seen by user
// ---------------------------------------------------------------------------
export async function acknowledgeModuleUpdate(
  moduleId: string
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const module = await prisma.module.findUnique({
      where: { id: moduleId, tenantId: ctx.tenantId },
      select: { version: true },
    });

    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    await prisma.userModuleReview.upsert({
      where: {
        userId_moduleId: {
          userId: currentUser.id,
          moduleId,
        },
      },
      create: {
        userId: currentUser.id,
        moduleId,
        tenantId: ctx.tenantId,
        lastSeenVersion: module.version,
      },
      update: {
        lastSeenVersion: module.version,
        acknowledgedAt: new Date(),
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri potrjevanju posodobitve" };
  }
}

// ---------------------------------------------------------------------------
// saveVideoMetadata - save Cloudflare Stream metadata to section after upload
// ---------------------------------------------------------------------------
export async function saveVideoMetadata(
  sectionId: string,
  data: {
    cloudflareStreamUid: string;
    videoFileName: string;
    videoSize: number;
    videoMimeType: string;
  }
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { module: { select: { createdById: true } } },
    });

    if (!existing) {
      return { success: false, error: "Section not found" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.module.createdById !== currentUser.id) {
        return { success: false, error: "Forbidden" };
      }
      const canManageOwn = await hasPermission(currentUser, "MANAGE_OWN_MODULES");
      if (!canManageOwn) {
        return { success: false, error: "Forbidden" };
      }
    }

    // Clean up old CF Stream video if replacing with a different one
    if (existing.cloudflareStreamUid && existing.cloudflareStreamUid !== data.cloudflareStreamUid) {
      try {
        const { deleteCloudflareStreamVideo } = await import("@/lib/cloudflare-stream");
        await deleteCloudflareStreamVideo(existing.cloudflareStreamUid);
      } catch {
        // Ignore
      }
    }

    // Clean up old blob if migrating from UPLOAD
    if (existing.videoBlobUrl) {
      try {
        const { del } = await import("@vercel/blob");
        await del(existing.videoBlobUrl);
      } catch {
        // Ignore
      }
    }

    await prisma.section.update({
      where: { id: sectionId },
      data: {
        videoSourceType: "CLOUDFLARE_STREAM",
        cloudflareStreamUid: data.cloudflareStreamUid,
        videoStatus: "PENDING",
        videoFileName: data.videoFileName,
        videoSize: data.videoSize,
        videoMimeType: data.videoMimeType,
        videoBlobUrl: null,
        videoBlobPathname: null,
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri shranjevanju video podatkov" };
  }
}

// ---------------------------------------------------------------------------
// linkMediaAssetToSection - link a MediaAsset to a section (for VideoAssetPicker)
// ---------------------------------------------------------------------------
export async function linkMediaAssetToSection(
  sectionId: string,
  assetId: string
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const section = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { module: { select: { createdById: true } } },
    });
    if (!section) {
      return { success: false, error: "Sekcija ne obstaja" };
    }

    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (section.module.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    // Validate asset belongs to same tenant and is READY
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId, tenantId: ctx.tenantId },
      select: { cfStreamUid: true, status: true },
    });
    if (!asset) {
      return { success: false, error: "Video ne obstaja" };
    }
    if (asset.status !== "READY") {
      return { success: false, error: "Video se še obdeluje" };
    }
    if (!asset.cfStreamUid) {
      return { success: false, error: "Video nima CF Stream UID" };
    }

    await prisma.section.update({
      where: { id: sectionId },
      data: {
        mediaAssetId: assetId,
        cloudflareStreamUid: asset.cfStreamUid,
        videoSourceType: "CLOUDFLARE_STREAM",
        videoStatus: "READY",
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri povezovanju videa s sekcijo" };
  }
}

// ---------------------------------------------------------------------------
// updateModuleMentors - set mentors for a module (replace all)
// ---------------------------------------------------------------------------
export async function updateModuleMentors(
  moduleId: string,
  mentorUserIds: string[]
): Promise<ActionResult<void>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const existing = await prisma.module.findUnique({
      where: { id: moduleId, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Check permissions
    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    if (!canManageAll) {
      if (existing.createdById !== currentUser.id) {
        throw new ForbiddenError("Nimate pravic za urejanje tega modula");
      }
      await requirePermission(currentUser, "MANAGE_OWN_MODULES");
    }

    // Validate that all mentor user IDs are active users with membership in this tenant
    if (mentorUserIds.length > 0) {
      const validMemberships = await prisma.membership.findMany({
        where: {
          tenantId: ctx.tenantId,
          userId: { in: mentorUserIds },
          user: { isActive: true },
        },
        select: { userId: true },
      });
      const validUserIds = new Set(validMemberships.map((m) => m.userId));
      const invalidIds = mentorUserIds.filter((id) => !validUserIds.has(id));
      if (invalidIds.length > 0) {
        return { success: false, error: "Nekateri uporabniki ne obstajajo ali niso aktivni" };
      }
    }

    // Transaction: delete all existing + create new
    await prisma.$transaction([
      prisma.moduleMentor.deleteMany({
        where: { moduleId, tenantId: ctx.tenantId },
      }),
      ...(mentorUserIds.length > 0
        ? [
            prisma.moduleMentor.createMany({
              data: mentorUserIds.map((userId) => ({
                moduleId,
                userId,
                tenantId: ctx.tenantId,
              })),
            }),
          ]
        : []),
    ]);

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: moduleId,
      tenantId: ctx.tenantId,
      metadata: { mentors: mentorUserIds },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri posodabljanju mentorjev" };
  }
}
