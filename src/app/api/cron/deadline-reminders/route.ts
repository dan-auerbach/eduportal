import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getModuleProgress } from "@/lib/progress";
import { format, formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
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

  const today = format(new Date(), "yyyy-MM-dd");
  const now = new Date();

  // Get all active (non-archived) tenants
  const tenants = await prisma.tenant.findMany({
    where: { archivedAt: null },
    select: { id: true, locale: true },
  });

  let totalProcessed = 0;
  let sent = 0;

  for (const tenant of tenants) {
    // Set locale for this tenant's notifications
    setLocale(isValidLocale(tenant.locale) ? tenant.locale : DEFAULT_LOCALE);
    // Find all module-group assignments that have a deadlineDays value for this tenant
    const moduleGroupsWithDeadline = await prisma.moduleGroup.findMany({
      where: {
        tenantId: tenant.id,
        deadlineDays: { not: null },
        module: { status: "PUBLISHED" },
      },
      include: {
        group: {
          include: {
            users: {
              select: {
                userId: true,
                assignedAt: true,
                user: { select: { id: true, email: true, firstName: true, lastName: true } },
              },
            },
          },
        },
        module: { select: { id: true, title: true } },
      },
    });

    totalProcessed += moduleGroupsWithDeadline.length;

    for (const mg of moduleGroupsWithDeadline) {
      for (const ug of mg.group.users) {
        // Calculate per-user deadline: assignedAt + deadlineDays
        const userDeadline = new Date(
          ug.assignedAt.getTime() + mg.deadlineDays! * 24 * 60 * 60 * 1000
        );

        // Only send reminders if deadline is within the next 3 days and hasn't passed
        if (userDeadline <= now) continue;
        const daysUntil = (userDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
        if (daysUntil > 3) continue;

        // Check dedup
        const existing = await prisma.notificationDedup.findUnique({
          where: {
            userId_type_entityId_dedupKey: {
              userId: ug.userId,
              type: "DEADLINE_REMINDER",
              entityId: mg.moduleId,
              dedupKey: today,
            },
          },
        });

        if (existing) continue;

        // Check if already completed
        const progress = await getModuleProgress(ug.userId, mg.moduleId, tenant.id);
        if (progress.status === "COMPLETED") continue;

        await prisma.$transaction([
          prisma.notification.create({
            data: {
              userId: ug.userId,
              tenantId: tenant.id,
              type: "DEADLINE_REMINDER",
              title: t("notifications.deadlineApproaching", { title: mg.module.title }),
              message: t("notifications.deadlineMessage", {
                time: formatDistanceToNow(userDeadline, { locale: getDateLocale() }),
              }),
              link: `/modules/${mg.moduleId}`,
            },
          }),
          prisma.notificationDedup.create({
            data: {
              userId: ug.userId,
              tenantId: tenant.id,
              type: "DEADLINE_REMINDER",
              entityId: mg.moduleId,
              dedupKey: today,
            },
          }),
        ]);
        sent++;
      }
    }
  }

  return NextResponse.json({ tenants: tenants.length, processed: totalProcessed, sent });
}
