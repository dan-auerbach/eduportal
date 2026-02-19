"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getTenantContext } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import { getModuleProgress, type ModuleProgress } from "@/lib/progress";
import { awardXp, XP_RULES } from "@/lib/xp";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// completeSection - upsert SectionCompletion, check module completion,
//                   auto-issue certificate if all sections done + quizzes passed
// ---------------------------------------------------------------------------
export async function completeSection(
  sectionId: string
): Promise<ActionResult<{ completed: boolean; moduleCompleted: boolean; readyForQuiz: boolean; certificateIssued: boolean }>> {
  try {
    const ctx = await getTenantContext();

    // Verify section exists and get moduleId
    const section = await prisma.section.findUnique({
      where: { id: sectionId },
      select: { id: true, moduleId: true },
    });

    if (!section) {
      return { success: false, error: "Sekcija ne obstaja" };
    }

    // Upsert section completion
    await prisma.sectionCompletion.upsert({
      where: {
        userId_sectionId: { userId: ctx.user.id, sectionId },
      },
      create: {
        userId: ctx.user.id,
        sectionId,
        tenantId: ctx.tenantId,
      },
      update: {
        completedAt: new Date(),
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "SECTION_COMPLETED",
      entityType: "Section",
      entityId: sectionId,
      tenantId: ctx.tenantId,
      metadata: { moduleId: section.moduleId },
    });

    // Check if module is now completed (all sections done + all quizzes passed)
    const progress = await getModuleProgress(ctx.user.id, section.moduleId, ctx.tenantId);
    let certificateIssued = false;

    if (progress.status === "COMPLETED" && !progress.certificateIssued) {
      // Check if there is an override that disallows certificate
      if (progress.hasOverride && !progress.overrideAllowsCertificate) {
        // Override exists but does not allow certificate; skip
      } else {
        // Issue certificate
        await prisma.certificate.create({
          data: {
            userId: ctx.user.id,
            moduleId: section.moduleId,
            tenantId: ctx.tenantId,
          },
        });

        await logAudit({
          actorId: ctx.user.id,
          action: "CERTIFICATE_ISSUED",
          entityType: "Certificate",
          entityId: section.moduleId,
          tenantId: ctx.tenantId,
          metadata: { userId: ctx.user.id, moduleId: section.moduleId },
        });

        certificateIssued = true;

        // Award XP for module completion (fire-and-forget to not block response)
        void awardXp({
          userId: ctx.user.id,
          tenantId: ctx.tenantId,
          amount: XP_RULES.MODULE_COMPLETED,
          source: "MODULE_COMPLETED",
          sourceEntityId: section.moduleId,
          description: "Zaključen modul",
        }).catch(() => {/* XP award failure should not break progress */});
      }
    }

    return {
      success: true,
      data: {
        completed: true,
        moduleCompleted: progress.status === "COMPLETED",
        readyForQuiz: progress.status === "READY_FOR_QUIZ",
        certificateIssued,
      },
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri zaključevanju sekcije" };
  }
}

// ---------------------------------------------------------------------------
// getMyModuleProgress - get progress for current user (tenant-scoped)
// ---------------------------------------------------------------------------
export async function getMyModuleProgress(
  moduleId: string
): Promise<ActionResult<ModuleProgress>> {
  try {
    const ctx = await getTenantContext();
    const progress = await getModuleProgress(ctx.user.id, moduleId, ctx.tenantId);
    return { success: true, data: progress };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju napredka" };
  }
}

// ---------------------------------------------------------------------------
// getUserModuleProgress - get progress for specific user (VIEW_ALL_PROGRESS)
// ---------------------------------------------------------------------------
export async function getUserModuleProgress(
  userId: string,
  moduleId: string
): Promise<ActionResult<ModuleProgress>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "VIEW_ALL_PROGRESS");

    const progress = await getModuleProgress(userId, moduleId, ctx.tenantId);
    return { success: true, data: progress };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri pridobivanju napredka uporabnika" };
  }
}

// ---------------------------------------------------------------------------
// overrideProgress - admin override (OVERRIDE_PROGRESS) (tenant-scoped)
// ---------------------------------------------------------------------------
export async function overrideProgress(
  userId: string,
  moduleId: string,
  reason: string,
  allowCertificate: boolean
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "OVERRIDE_PROGRESS");

    if (!reason || reason.trim().length === 0) {
      return { success: false, error: "Razlog za preglasitev je obvezen" };
    }

    // Verify user, module, and tenant membership
    const [user, module, userMembership] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.module.findUnique({ where: { id: moduleId } }),
      prisma.membership.findUnique({
        where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
      }),
    ]);

    if (!user) {
      return { success: false, error: "Uporabnik ne obstaja" };
    }
    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    // Verify user has membership in this tenant
    if (!userMembership) {
      return { success: false, error: "Uporabnik ni član tega podjetja" };
    }

    // Verify module belongs to this tenant
    if (module.tenantId !== ctx.tenantId) {
      return { success: false, error: "Modul ne obstaja" };
    }

    const override = await prisma.progressOverride.upsert({
      where: { userId_moduleId: { userId, moduleId } },
      create: {
        userId,
        moduleId,
        tenantId: ctx.tenantId,
        overrideById: ctx.user.id,
        reason: reason.trim(),
        allowCertificate,
      },
      update: {
        overrideById: ctx.user.id,
        reason: reason.trim(),
        allowCertificate,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "PROGRESS_OVERRIDDEN",
      entityType: "ProgressOverride",
      entityId: override.id,
      tenantId: ctx.tenantId,
      metadata: { userId, moduleId, reason, allowCertificate },
    });

    // If allowCertificate, auto-issue certificate if not already issued
    if (allowCertificate) {
      const existingCert = await prisma.certificate.findUnique({
        where: { userId_moduleId: { userId, moduleId } },
      });

      if (!existingCert) {
        await prisma.certificate.create({
          data: {
            userId,
            moduleId,
            tenantId: ctx.tenantId,
          },
        });

        await logAudit({
          actorId: ctx.user.id,
          action: "CERTIFICATE_ISSUED",
          entityType: "Certificate",
          entityId: moduleId,
          tenantId: ctx.tenantId,
          metadata: { userId, moduleId, viaOverride: true },
        });
      }
    }

    return { success: true, data: { id: override.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri preglasitvi napredka" };
  }
}
