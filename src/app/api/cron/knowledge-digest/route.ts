import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderTemplate, buildEmailFooter, getAppUrl } from "@/lib/email";
import { EMAIL_DEFAULTS } from "@/lib/email-defaults";
import { format } from "date-fns";
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
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const today = format(now, "yyyy-MM-dd");
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

    // Find modules published in the last 24 hours
    const newModules = await prisma.module.findMany({
      where: {
        tenantId: tenant.id,
        status: "PUBLISHED",
        publishedAt: {
          gte: yesterday,
          lte: now,
        },
      },
      select: {
        id: true,
        title: true,
        groups: {
          select: {
            group: {
              select: {
                users: {
                  select: {
                    userId: true,
                    user: {
                      select: { id: true, email: true, firstName: true, isActive: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (newModules.length === 0) continue;

    // Build per-user → modules map
    const userModulesMap = new Map<
      string,
      { email: string; firstName: string; modules: { id: string; title: string }[] }
    >();

    for (const mod of newModules) {
      for (const mg of mod.groups) {
        for (const ug of mg.group.users) {
          if (!ug.user.isActive) continue;
          const existing = userModulesMap.get(ug.userId);
          if (existing) {
            // Avoid duplicates if user is in multiple groups assigned the same module
            if (!existing.modules.find((m) => m.id === mod.id)) {
              existing.modules.push({ id: mod.id, title: mod.title });
            }
          } else {
            userModulesMap.set(ug.userId, {
              email: ug.user.email,
              firstName: ug.user.firstName,
              modules: [{ id: mod.id, title: mod.title }],
            });
          }
        }
      }
    }

    const appUrl = getAppUrl();

    for (const [userId, userData] of userModulesMap) {
      // Check email preference — only send to DAILY (default)
      const pref = await prisma.emailPreference.findUnique({
        where: { userId_tenantId: { userId, tenantId: tenant.id } },
        select: { newKnowledgeDigest: true },
      });
      // Default is DAILY; skip if MUTED or INSTANT (INSTANT users get notified immediately)
      if (pref?.newKnowledgeDigest === "MUTED" || pref?.newKnowledgeDigest === "INSTANT") continue;

      // Dedup: one digest per user per day
      const existing = await prisma.notificationDedup.findUnique({
        where: {
          userId_type_entityId_dedupKey: {
            userId,
            type: "NEW_KNOWLEDGE",
            entityId: tenant.id, // Use tenant as entity for digest
            dedupKey: `digest-${today}`,
          },
        },
      });
      if (existing) continue;

      // Build module list
      const moduleList = userData.modules
        .map((m) => `  • ${m.title}`)
        .join("\n");

      const subject = renderTemplate(defaults.knowledgeDigestSubject, {
        tenantName: tenant.name,
      });
      const body = renderTemplate(defaults.knowledgeDigestBody, {
        firstName: userData.firstName,
        moduleList,
        link: `${appUrl}/dashboard`,
        tenantName: tenant.name,
      });

      const footer = await buildEmailFooter(
        userId,
        tenant.id,
        "newKnowledgeDigest",
        locale,
      );

      await sendEmail({
        to: userData.email,
        subject,
        text: body + footer.text,
        headers: { "List-Unsubscribe": `<${footer.unsubscribeUrl}>` },
      });

      // Record dedup
      await prisma.notificationDedup.create({
        data: {
          userId,
          tenantId: tenant.id,
          type: "NEW_KNOWLEDGE",
          entityId: tenant.id,
          dedupKey: `digest-${today}`,
        },
      });

      sent++;
    }
  }

  return NextResponse.json({ tenants: tenants.length, sent });
}
