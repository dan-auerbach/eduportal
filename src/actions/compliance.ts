"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ExpiringModuleDTO = {
  moduleId: string;
  moduleTitle: string;
  userId: string;
  userName: string;
  certificateIssuedAt: string;
  expiresAt: string;
  daysRemaining: number;
  validityMonths: number;
};

export type ExpiredModuleDTO = ExpiringModuleDTO & {
  isExpired: boolean;
};

// ── Get expiring/expired modules for admin ───────────────────────────────────

export async function getComplianceOverview(): Promise<
  ActionResult<{ expiring: ExpiredModuleDTO[]; expired: ExpiredModuleDTO[] }>
> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "VIEW_ALL_PROGRESS", { tenantId: ctx.tenantId });

    // Find all modules with validity configured
    const modulesWithValidity = await prisma.module.findMany({
      where: {
        tenantId: ctx.tenantId,
        validityMonths: { not: null },
        status: "PUBLISHED",
      },
      select: { id: true, title: true, validityMonths: true },
    });

    if (modulesWithValidity.length === 0) {
      return { success: true, data: { expiring: [], expired: [] } };
    }

    // Find all certificates for these modules
    const certificates = await prisma.certificate.findMany({
      where: {
        tenantId: ctx.tenantId,
        moduleId: { in: modulesWithValidity.map((m) => m.id) },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    const now = new Date();
    const expiring: ExpiredModuleDTO[] = [];
    const expired: ExpiredModuleDTO[] = [];

    for (const cert of certificates) {
      const mod = modulesWithValidity.find((m) => m.id === cert.moduleId);
      if (!mod || !mod.validityMonths) continue;

      const expiresAt = new Date(cert.issuedAt);
      expiresAt.setMonth(expiresAt.getMonth() + mod.validityMonths);

      const daysRemaining = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      const entry: ExpiredModuleDTO = {
        moduleId: mod.id,
        moduleTitle: mod.title,
        userId: cert.user.id,
        userName: `${cert.user.firstName} ${cert.user.lastName}`,
        certificateIssuedAt: cert.issuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        daysRemaining,
        validityMonths: mod.validityMonths,
        isExpired: daysRemaining <= 0,
      };

      if (daysRemaining <= 0) {
        expired.push(entry);
      } else if (daysRemaining <= 30) {
        expiring.push(entry);
      }
    }

    // Sort
    expiring.sort((a, b) => a.daysRemaining - b.daysRemaining);
    expired.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return { success: true, data: { expiring, expired } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError)
      return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Get my expiring modules (employee) ───────────────────────────────────────

export async function getMyExpiringModules(): Promise<
  ActionResult<ExpiringModuleDTO[]>
> {
  try {
    const ctx = await getTenantContext();

    const certificates = await prisma.certificate.findMany({
      where: { userId: ctx.user.id, tenantId: ctx.tenantId },
      include: {
        module: { select: { id: true, title: true, validityMonths: true } },
      },
    });

    const now = new Date();
    const result: ExpiringModuleDTO[] = [];

    for (const cert of certificates) {
      if (!cert.module.validityMonths) continue;

      const expiresAt = new Date(cert.issuedAt);
      expiresAt.setMonth(expiresAt.getMonth() + cert.module.validityMonths);

      const daysRemaining = Math.ceil(
        (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysRemaining <= 30) {
        result.push({
          moduleId: cert.module.id,
          moduleTitle: cert.module.title,
          userId: ctx.user.id,
          userName: "",
          certificateIssuedAt: cert.issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          daysRemaining,
          validityMonths: cert.module.validityMonths,
        });
      }
    }

    result.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return { success: true, data: result };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Reassign expired module ───────────────────────────────────────────

export async function reassignExpiredModule(
  userId: string,
  moduleId: string,
): Promise<ActionResult<void>> {
  try {
    const ctx = await getTenantContext();
    await requirePermission(ctx.user, "OVERRIDE_PROGRESS", { tenantId: ctx.tenantId });

    // Verify module exists and has validity
    const module = await prisma.module.findFirst({
      where: { id: moduleId, tenantId: ctx.tenantId },
      select: { id: true, title: true, validityMonths: true },
    });
    if (!module) return { success: false, error: "Modul ne obstaja" };

    // Delete section completions, certificate, and override for this user+module
    await prisma.$transaction([
      prisma.sectionCompletion.deleteMany({
        where: {
          userId,
          section: { moduleId },
          tenantId: ctx.tenantId,
        },
      }),
      prisma.certificate.deleteMany({
        where: { userId, moduleId, tenantId: ctx.tenantId },
      }),
      prisma.progressOverride.deleteMany({
        where: { userId, moduleId, tenantId: ctx.tenantId },
      }),
    ]);

    // Notify user
    await prisma.notification.create({
      data: {
        userId,
        tenantId: ctx.tenantId,
        type: "MODULE_EXPIRED",
        title: `Modul ponovno dodeljen: ${module.title}`,
        message: `Veljavnost modula "${module.title}" je potekla. Modul je bil ponovno dodeljen.`,
        link: `/modules/${moduleId}`,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "MODULE_REASSIGNED",
      entityType: "Module",
      entityId: moduleId,
      metadata: { userId, moduleTitle: module.title },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError)
      return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}
