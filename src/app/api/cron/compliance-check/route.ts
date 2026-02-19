import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { awardXp, XP_RULES } from "@/lib/xp";
import { format } from "date-fns";
import { t, setLocale, isValidLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import { timingSafeEqual } from "crypto";

function verifyCronSecret(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { archivedAt: null },
    select: { id: true, locale: true },
  });

  let expiredCount = 0;
  let reminderCount = 0;

  for (const tenant of tenants) {
    setLocale(isValidLocale(tenant.locale) ? tenant.locale : DEFAULT_LOCALE);

    // Find certificates for modules that have validityMonths set
    const certificates = await prisma.certificate.findMany({
      where: {
        tenantId: tenant.id,
        module: { validityMonths: { not: null } },
      },
      include: {
        module: { select: { id: true, title: true, validityMonths: true } },
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    for (const cert of certificates) {
      if (!cert.module.validityMonths) continue;

      // Calculate expiry date
      const expiryDate = new Date(cert.issuedAt);
      expiryDate.setMonth(expiryDate.getMonth() + cert.module.validityMonths);

      const msUntilExpiry = expiryDate.getTime() - now.getTime();
      const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);

      // ── EXPIRED: reset progress ──
      if (msUntilExpiry <= 0) {
        // Dedup check — only process once
        const dedupKey = `expired:${today}`;
        const existing = await prisma.notificationDedup.findUnique({
          where: {
            userId_type_entityId_dedupKey: {
              userId: cert.userId,
              type: "MODULE_EXPIRED",
              entityId: cert.moduleId,
              dedupKey,
            },
          },
        });

        if (existing) continue;

        // Reset progress: delete section completions, certificate, progress override
        await prisma.$transaction([
          prisma.sectionCompletion.deleteMany({
            where: {
              userId: cert.userId,
              tenantId: tenant.id,
              section: { moduleId: cert.moduleId },
            },
          }),
          prisma.certificate.delete({
            where: { id: cert.id },
          }),
          prisma.progressOverride.deleteMany({
            where: {
              userId: cert.userId,
              moduleId: cert.moduleId,
            },
          }),
          // Notification
          prisma.notification.create({
            data: {
              userId: cert.userId,
              tenantId: tenant.id,
              type: "MODULE_EXPIRED",
              title: t("notifications.moduleExpired", { title: cert.module.title }),
              message: t("notifications.moduleExpiredMessage", { title: cert.module.title }),
              link: `/modules/${cert.moduleId}`,
            },
          }),
          // Dedup
          prisma.notificationDedup.create({
            data: {
              userId: cert.userId,
              tenantId: tenant.id,
              type: "MODULE_EXPIRED",
              entityId: cert.moduleId,
              dedupKey,
            },
          }),
        ]);

        expiredCount++;
        continue;
      }

      // ── EXPIRING SOON (within 30 days): send reminder ──
      if (daysUntilExpiry <= 30) {
        const dedupKey = `expiring:${today}`;
        const existing = await prisma.notificationDedup.findUnique({
          where: {
            userId_type_entityId_dedupKey: {
              userId: cert.userId,
              type: "MODULE_EXPIRING",
              entityId: cert.moduleId,
              dedupKey,
            },
          },
        });

        if (existing) continue;

        await prisma.$transaction([
          prisma.notification.create({
            data: {
              userId: cert.userId,
              tenantId: tenant.id,
              type: "MODULE_EXPIRING",
              title: t("notifications.moduleExpiring", { title: cert.module.title }),
              message: t("notifications.moduleExpiringMessage", {
                title: cert.module.title,
                days: Math.ceil(daysUntilExpiry).toString(),
              }),
              link: `/modules/${cert.moduleId}`,
            },
          }),
          prisma.notificationDedup.create({
            data: {
              userId: cert.userId,
              tenantId: tenant.id,
              type: "MODULE_EXPIRING",
              entityId: cert.moduleId,
              dedupKey,
            },
          }),
        ]);

        reminderCount++;
      }
    }

    // ── Check for renewal XP bonus ──
    // Award COMPLIANCE_RENEWAL XP if a user completed a module again before its
    // previous certificate expired (i.e., has a valid cert for a module that has
    // validityMonths, and the cert was issued within the validity period of the
    // module-group assignment's renewalXpBonus > 0).
    const moduleGroupsWithBonus = await prisma.moduleGroup.findMany({
      where: {
        tenantId: tenant.id,
        renewalXpBonus: { gt: 0 },
        module: { validityMonths: { not: null }, status: "PUBLISHED" },
      },
      include: {
        module: { select: { id: true, validityMonths: true } },
        group: { select: { users: { select: { userId: true } } } },
      },
    });

    for (const mg of moduleGroupsWithBonus) {
      for (const member of mg.group.users) {
        // Check if user has a certificate issued today (fresh renewal)
        const cert = await prisma.certificate.findUnique({
          where: {
            userId_moduleId: { userId: member.userId, moduleId: mg.module.id },
          },
        });

        if (!cert) continue;

        // Check if the certificate was issued today
        const issuedToday = format(cert.issuedAt, "yyyy-MM-dd") === today;
        if (!issuedToday) continue;

        // Check dedup for renewal XP
        const renewalDedup = await prisma.notificationDedup.findUnique({
          where: {
            userId_type_entityId_dedupKey: {
              userId: member.userId,
              type: "MODULE_EXPIRING", // reuse type for dedup
              entityId: `renewal:${mg.module.id}`,
              dedupKey: today,
            },
          },
        });

        if (renewalDedup) continue;

        // Award renewal bonus XP
        await awardXp({
          userId: member.userId,
          tenantId: tenant.id,
          amount: mg.renewalXpBonus,
          source: "COMPLIANCE_RENEWAL",
          sourceEntityId: mg.module.id,
          description: "Pravočasna obnovitev certifikata",
        });

        // Dedup
        await prisma.notificationDedup.create({
          data: {
            userId: member.userId,
            tenantId: tenant.id,
            type: "MODULE_EXPIRING",
            entityId: `renewal:${mg.module.id}`,
            dedupKey: today,
          },
        });
      }
    }
  }

  return NextResponse.json({
    tenants: tenants.length,
    expired: expiredCount,
    reminders: reminderCount,
  });
}
