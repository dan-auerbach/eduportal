import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderTemplate, buildEmailFooter } from "@/lib/email";
import { EMAIL_DEFAULTS } from "@/lib/email-defaults";
import { setLocale, isValidLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { timingSafeEqual } from "crypto";

/** Format a Date as "d. MMMM yyyy ob HH:mm" in Europe/Ljubljana timezone */
function formatDateTimeCET(date: Date, locale: string): string {
  const loc = locale === "sl" ? "sl-SI" : "en-GB";
  const tz = "Europe/Ljubljana";
  const datePart = date.toLocaleDateString(loc, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  });
  const timePart = date.toLocaleTimeString(loc, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
  return `${datePart} ob ${timePart}`;
}

function verifyCronSecret(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

/**
 * Live training reminder cron — runs daily at 07:00 UTC.
 * Sends a reminder for all MentorLiveEvents starting in the next 24 hours.
 * If an event has groups assigned, only members of those groups receive the reminder.
 * If no groups are assigned, all tenant members receive it (backward compatible).
 * Users in multiple groups only receive one email per event.
 * Hobby plan limitation: can only run 1x/day, so no 1h-before reminder.
 */
export async function GET(req: Request) {
  if (!verifyCronSecret(req)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
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

    // Find events starting in the next 24 hours, including their groups
    const events = await prisma.mentorLiveEvent.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: {
          gte: now,
          lte: in24h,
        },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        meetUrl: true,
        groups: { select: { groupId: true } },
      },
    });

    for (const event of events) {
      const groupIds = event.groups.map((g) => g.groupId);

      // Determine target users based on whether event has groups
      let targetUsers: Array<{ userId: string; user: { id: string; email: string; firstName: string } }>;

      if (groupIds.length > 0) {
        // Event has groups: only send to unique members of those groups
        const userGroups = await prisma.userGroup.findMany({
          where: {
            groupId: { in: groupIds },
            tenantId: tenant.id,
            user: { isActive: true, deletedAt: null },
          },
          select: {
            userId: true,
            user: { select: { id: true, email: true, firstName: true } },
          },
        });
        // Deduplicate users across groups
        const seen = new Set<string>();
        targetUsers = [];
        for (const ug of userGroups) {
          if (!seen.has(ug.userId)) {
            seen.add(ug.userId);
            targetUsers.push(ug);
          }
        }
      } else {
        // No groups: send to all tenant members (backward compatible)
        targetUsers = await prisma.membership.findMany({
          where: {
            tenantId: tenant.id,
            user: { isActive: true, deletedAt: null },
          },
          select: {
            userId: true,
            user: { select: { id: true, email: true, firstName: true } },
          },
        });
      }

      for (const target of targetUsers) {
        const userId = target.userId;

        // Check email preference
        const pref = await prisma.emailPreference.findUnique({
          where: { userId_tenantId: { userId, tenantId: tenant.id } },
          select: { liveTrainingReminder: true },
        });
        // Default is true; skip if explicitly false
        if (pref && !pref.liveTrainingReminder) continue;

        // Dedup: one email per event per user
        const dedupKey = `live-${event.id}`;
        const existing = await prisma.notificationDedup.findUnique({
          where: {
            userId_type_entityId_dedupKey: {
              userId,
              type: "SYSTEM",
              entityId: event.id,
              dedupKey,
            },
          },
        });
        if (existing) continue;

        // Build email
        const formattedDate = formatDateTimeCET(event.startsAt, locale);
        const subject = renderTemplate(defaults.liveReminderSubject, {
          eventTitle: event.title,
          startsAt: formattedDate,
          tenantName: tenant.name,
        });
        const body = renderTemplate(defaults.liveReminderBody, {
          firstName: target.user.firstName,
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
          to: target.user.email,
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

  return NextResponse.json({ tenants: tenants.length, sent });
}
