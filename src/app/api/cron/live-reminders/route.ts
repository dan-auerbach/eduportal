import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderTemplate, buildEmailFooter } from "@/lib/email";
import { EMAIL_DEFAULTS } from "@/lib/email-defaults";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { setLocale, isValidLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
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
  let sent = 0;

  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, locale: true },
  });

  for (const tenant of tenants) {
    const locale = (isValidLocale(tenant.locale) ? tenant.locale : DEFAULT_LOCALE) as Locale;
    setLocale(locale);
    const defaults = EMAIL_DEFAULTS[locale] ?? EMAIL_DEFAULTS.sl;

    // Find events starting in ~24h (±15 min window) or ~1h (±15 min window)
    const windows = [
      { label: "24h", minMs: 23 * 60 + 45, maxMs: 24 * 60 + 15 }, // 23:45 to 24:15
      { label: "1h", minMs: 45, maxMs: 75 }, // 0:45 to 1:15
    ];

    for (const window of windows) {
      const windowStart = new Date(now.getTime() + window.minMs * 60 * 1000);
      const windowEnd = new Date(now.getTime() + window.maxMs * 60 * 1000);

      const events = await prisma.mentorLiveEvent.findMany({
        where: {
          tenantId: tenant.id,
          startsAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          meetUrl: true,
        },
      });

      for (const event of events) {
        // Find all users with membership in this tenant
        const memberships = await prisma.membership.findMany({
          where: {
            tenantId: tenant.id,
            user: { isActive: true, deletedAt: null },
          },
          select: {
            userId: true,
            user: { select: { id: true, email: true, firstName: true } },
          },
        });

        for (const membership of memberships) {
          const userId = membership.userId;

          // Check email preference
          const pref = await prisma.emailPreference.findUnique({
            where: { userId_tenantId: { userId, tenantId: tenant.id } },
            select: { liveTrainingReminder: true },
          });
          // Default is true; skip if explicitly false
          if (pref && !pref.liveTrainingReminder) continue;

          // Dedup: one email per event per time window per user
          const dedupKey = `live-${window.label}-${event.id}`;
          const existing = await prisma.notificationDedup.findUnique({
            where: {
              userId_type_entityId_dedupKey: {
                userId,
                type: "SYSTEM", // Use SYSTEM for live reminders
                entityId: event.id,
                dedupKey,
              },
            },
          });
          if (existing) continue;

          // Build email
          const formattedDate = format(event.startsAt, "d. MMMM yyyy 'ob' HH:mm", {
            locale: getDateLocale(),
          });
          const subject = renderTemplate(defaults.liveReminderSubject, {
            eventTitle: event.title,
            startsAt: formattedDate,
            tenantName: tenant.name,
          });
          const body = renderTemplate(defaults.liveReminderBody, {
            firstName: membership.user.firstName,
            eventTitle: event.title,
            startsAt: formattedDate,
            meetUrl: event.meetUrl,
            tenantName: tenant.name,
          });

          const footer = await buildEmailFooter(
            userId,
            tenant.id,
            "liveTrainingReminder",
            locale,
          );

          await sendEmail({
            to: membership.user.email,
            subject,
            text: body + footer.text,
            headers: { "List-Unsubscribe": `<${footer.unsubscribeUrl}>` },
          });

          // Record dedup
          await prisma.notificationDedup.create({
            data: {
              userId,
              tenantId: tenant.id,
              type: "SYSTEM",
              entityId: event.id,
              dedupKey,
            },
          });

          sent++;
        }
      }
    }
  }

  return NextResponse.json({ tenants: tenants.length, sent });
}
