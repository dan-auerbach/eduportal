"use server";

import crypto from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderTemplate, getAppUrl, buildEmailFooter } from "@/lib/email";
import { EMAIL_DEFAULTS } from "@/lib/email-defaults";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { getLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

// ── Types ────────────────────────────────────────────────────────────────────

type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function getLocaleOrDefault(): Locale {
  try {
    return getLocale();
  } catch {
    return "sl";
  }
}

/**
 * Get email template for a tenant, falling back to defaults.
 * `field` is one of: inviteSubject, inviteBody, resetSubject, resetBody
 */
async function getTemplate(
  tenantId: string | null,
  field: "inviteSubject" | "inviteBody" | "resetSubject" | "resetBody",
  locale: Locale,
): Promise<string> {
  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        emailInviteSubject: true,
        emailInviteBody: true,
        emailResetSubject: true,
        emailResetBody: true,
      },
    });

    // Map field name to tenant column
    const fieldMap = {
      inviteSubject: tenant?.emailInviteSubject,
      inviteBody: tenant?.emailInviteBody,
      resetSubject: tenant?.emailResetSubject,
      resetBody: tenant?.emailResetBody,
    };

    if (fieldMap[field]) return fieldMap[field];
  }

  // Fallback to defaults
  const defaults = EMAIL_DEFAULTS[locale] ?? EMAIL_DEFAULTS.sl;
  return defaults[field as keyof typeof defaults] as string;
}

/** Get tenant name by id, or fallback */
async function getTenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? "Mentor";
}

// ── Password Reset ───────────────────────────────────────────────────────────

/**
 * Request a password reset email.
 * Public action — rate limited, always returns success (security best practice).
 */
export async function requestPasswordReset(
  email: string,
): Promise<ActionResult> {
  // Rate limit: 3 attempts per 15 minutes per email
  const rl = await rateLimit(`pwd-reset:${email.toLowerCase()}`, 3, 15 * 60_000);
  if (!rl.success) {
    // Still return success to not reveal rate limiting
    return { success: true, data: undefined };
  }

  const locale = getLocaleOrDefault();

  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        firstName: true,
        email: true,
        isActive: true,
        deletedAt: true,
        memberships: {
          select: { tenantId: true, tenant: { select: { name: true } } },
          take: 1,
        },
      },
    });

    // Silently succeed if user not found (don't reveal existence)
    if (!user || !user.isActive || user.deletedAt) {
      return { success: true, data: undefined };
    }

    // Use first tenant for branding (or null if no memberships)
    const tenantId = user.memberships[0]?.tenantId ?? null;
    const tenantName = user.memberships[0]?.tenant.name ?? "Mentor";

    // Generate token (1 hour expiry)
    const token = generateToken();
    await prisma.emailToken.create({
      data: {
        userId: user.id,
        tenantId,
        type: "PASSWORD_RESET",
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    // Build reset URL
    const resetUrl = `${getAppUrl()}/auth/reset-password/${token}`;

    // Get templates (tenant custom or defaults)
    const subject = renderTemplate(
      await getTemplate(tenantId, "resetSubject", locale),
      { firstName: user.firstName, tenantName, link: resetUrl },
    );
    const body = renderTemplate(
      await getTemplate(tenantId, "resetBody", locale),
      { firstName: user.firstName, tenantName, link: resetUrl },
    );

    // Send email
    await sendEmail({ to: user.email, subject, text: body });

    // Audit log
    await logAudit({
      actorId: user.id,
      tenantId: tenantId ?? undefined,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      metadata: { email: user.email },
    });
  } catch (err) {
    console.error("[requestPasswordReset] Error:", err);
    // Still return success — don't reveal errors to caller
  }

  return { success: true, data: undefined };
}

/**
 * Verify a password reset token (for the reset page to check before showing form).
 */
export async function verifyResetToken(
  token: string,
): Promise<ActionResult<{ type: "PASSWORD_RESET" | "INVITE"; firstName: string; tenantName: string | null }>> {
  try {
    const emailToken = await prisma.emailToken.findUnique({
      where: { token },
      include: {
        user: { select: { firstName: true } },
        tenant: { select: { name: true } },
      },
    });

    if (!emailToken) {
      return { success: false, error: "INVALID_TOKEN" };
    }

    if (emailToken.usedAt) {
      return { success: false, error: "TOKEN_USED" };
    }

    if (emailToken.expiresAt < new Date()) {
      return { success: false, error: "TOKEN_EXPIRED" };
    }

    return {
      success: true,
      data: {
        type: emailToken.type as "PASSWORD_RESET" | "INVITE",
        firstName: emailToken.user.firstName,
        tenantName: emailToken.tenant?.name ?? null,
      },
    };
  } catch (err) {
    console.error("[verifyResetToken] Error:", err);
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

/**
 * Reset password using a valid token.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<ActionResult> {
  if (!newPassword || newPassword.length < 8) {
    return { success: false, error: "PASSWORD_TOO_SHORT" };
  }

  try {
    const emailToken = await prisma.emailToken.findUnique({
      where: { token },
      include: {
        user: { select: { id: true, email: true, firstName: true } },
      },
    });

    if (!emailToken) {
      return { success: false, error: "INVALID_TOKEN" };
    }

    if (emailToken.usedAt) {
      return { success: false, error: "TOKEN_USED" };
    }

    if (emailToken.expiresAt < new Date()) {
      return { success: false, error: "TOKEN_EXPIRED" };
    }

    // Hash new password
    const passwordHash = await hash(newPassword, 12);

    // Update password + mark token as used (transaction)
    await prisma.$transaction([
      prisma.user.update({
        where: { id: emailToken.userId },
        data: { passwordHash },
      }),
      prisma.emailToken.update({
        where: { id: emailToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Determine audit action based on token type
    const auditAction = emailToken.type === "INVITE" ? "INVITE_ACCEPTED" : "PASSWORD_RESET_COMPLETED";

    await logAudit({
      actorId: emailToken.userId,
      tenantId: emailToken.tenantId ?? undefined,
      action: auditAction,
      entityType: "User",
      entityId: emailToken.userId,
      metadata: { email: emailToken.user.email },
    });

    // Send security notice (fire-and-forget, only for password reset — not initial invite)
    if (emailToken.type === "PASSWORD_RESET") {
      void sendSecurityNotice(emailToken.userId, "PASSWORD_CHANGED");
    }

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[resetPasswordWithToken] Error:", err);
    return { success: false, error: "UNKNOWN_ERROR" };
  }
}

// ── Invite Email ─────────────────────────────────────────────────────────────

/**
 * Send an invite email to a newly created user.
 * Called from the admin user creation dialog.
 */
export async function sendInviteEmail(
  userId: string,
  inviteToken: string,
): Promise<ActionResult> {
  const locale = getLocaleOrDefault();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    // Find the invite token record to get tenantId
    const tokenRecord = await prisma.emailToken.findUnique({
      where: { token: inviteToken },
      select: { tenantId: true },
    });

    const tenantId = tokenRecord?.tenantId ?? null;
    const tenantName = tenantId ? await getTenantName(tenantId) : "Mentor";

    // Build invite URL
    const inviteUrl = `${getAppUrl()}/auth/reset-password/${inviteToken}`;

    // Get templates (tenant custom or defaults)
    const subject = renderTemplate(
      await getTemplate(tenantId, "inviteSubject", locale),
      { firstName: user.firstName, tenantName, link: inviteUrl },
    );
    const body = renderTemplate(
      await getTemplate(tenantId, "inviteBody", locale),
      { firstName: user.firstName, tenantName, link: inviteUrl },
    );

    // Send email
    const result = await sendEmail({ to: user.email, subject, text: body });

    if (!result.success) {
      return { success: false, error: result.error ?? "Failed to send email" };
    }

    // Audit log
    if (tenantId) {
      await logAudit({
        actorId: userId,
        tenantId,
        action: "INVITE_SENT",
        entityType: "User",
        entityId: userId,
        metadata: { email: user.email, messageId: result.messageId },
      });
    }

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[sendInviteEmail] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Get a preview of the invite email text (for copy-to-clipboard).
 */
export async function getInvitePreview(
  userId: string,
  inviteToken: string,
): Promise<ActionResult<{ subject: string; body: string }>> {
  const locale = getLocaleOrDefault();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });

    if (!user) {
      return { success: false, error: "User not found" };
    }

    const tokenRecord = await prisma.emailToken.findUnique({
      where: { token: inviteToken },
      select: { tenantId: true },
    });

    const tenantId = tokenRecord?.tenantId ?? null;
    const tenantName = tenantId ? await getTenantName(tenantId) : "Mentor";
    const inviteUrl = `${getAppUrl()}/auth/reset-password/${inviteToken}`;

    const subject = renderTemplate(
      await getTemplate(tenantId, "inviteSubject", locale),
      { firstName: user.firstName, tenantName, link: inviteUrl },
    );
    const body = renderTemplate(
      await getTemplate(tenantId, "inviteBody", locale),
      { firstName: user.firstName, tenantName, link: inviteUrl },
    );

    return { success: true, data: { subject, body } };
  } catch (err) {
    console.error("[getInvitePreview] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Security Notices ─────────────────────────────────────────────────────────

/**
 * Send a security notice email (password changed, email changed).
 * Respects EmailPreference.securityNotices — won't send if opted out.
 * Fire-and-forget — errors are logged but not surfaced.
 */
export async function sendSecurityNotice(
  userId: string,
  type: "PASSWORD_CHANGED" | "EMAIL_CHANGED",
  opts?: { oldEmail?: string },
): Promise<void> {
  const locale = getLocaleOrDefault();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        firstName: true,
        memberships: {
          select: {
            tenantId: true,
            tenant: { select: { name: true } },
          },
          take: 1,
        },
      },
    });

    if (!user) return;

    const tenantId = user.memberships[0]?.tenantId ?? null;
    const tenantName = user.memberships[0]?.tenant.name ?? "Mentor";

    // Check email preference (securityNotices)
    if (tenantId) {
      const pref = await prisma.emailPreference.findUnique({
        where: { userId_tenantId: { userId, tenantId } },
        select: { securityNotices: true },
      });
      // If preference exists and securityNotices is false, skip
      if (pref && !pref.securityNotices) return;
    }

    // Get templates from defaults (no tenant-custom templates for security notices)
    const defaults = EMAIL_DEFAULTS[locale] ?? EMAIL_DEFAULTS.sl;
    let subject: string;
    let body: string;

    if (type === "PASSWORD_CHANGED") {
      subject = renderTemplate(defaults.passwordChangedSubject, { firstName: user.firstName, tenantName });
      body = renderTemplate(defaults.passwordChangedBody, { firstName: user.firstName, tenantName });
    } else {
      subject = renderTemplate(defaults.emailChangedSubject, { firstName: user.firstName, tenantName });
      body = renderTemplate(defaults.emailChangedBody, { firstName: user.firstName, tenantName });
    }

    // Send to current email
    await sendEmail({ to: user.email, subject, text: body });

    // If email was changed, also notify the old email
    if (type === "EMAIL_CHANGED" && opts?.oldEmail && opts.oldEmail !== user.email) {
      await sendEmail({ to: opts.oldEmail, subject, text: body });
    }

    await logAudit({
      actorId: userId,
      tenantId: tenantId ?? undefined,
      action: "EMAIL_SENT",
      entityType: "User",
      entityId: userId,
      metadata: { type, email: user.email },
    });
  } catch (err) {
    console.error("[sendSecurityNotice] Error:", err);
    // Fire-and-forget — don't throw
  }
}

// ── Email Preferences ────────────────────────────────────────────────────────

type EmailPreferenceData = {
  mentorQuestion: string;
  liveTrainingReminder: boolean;
  newKnowledgeDigest: string;
  securityNotices: boolean;
};

/**
 * Get email preferences for current user in active tenant.
 * Creates default preferences if none exist.
 */
export async function getEmailPreferences(): Promise<ActionResult<EmailPreferenceData>> {
  try {
    const { getTenantContext } = await import("@/lib/tenant");
    const ctx = await getTenantContext();

    let pref = await prisma.emailPreference.findUnique({
      where: { userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId } },
    });

    if (!pref) {
      pref = await prisma.emailPreference.create({
        data: {
          userId: ctx.user.id,
          tenantId: ctx.tenantId,
        },
      });
    }

    return {
      success: true,
      data: {
        mentorQuestion: pref.mentorQuestion,
        liveTrainingReminder: pref.liveTrainingReminder,
        newKnowledgeDigest: pref.newKnowledgeDigest,
        securityNotices: pref.securityNotices,
      },
    };
  } catch (err) {
    console.error("[getEmailPreferences] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Update email preferences for current user in active tenant.
 */
export async function updateEmailPreferences(
  data: Partial<EmailPreferenceData>,
): Promise<ActionResult> {
  try {
    const { getTenantContext } = await import("@/lib/tenant");
    const ctx = await getTenantContext();

    await prisma.emailPreference.upsert({
      where: { userId_tenantId: { userId: ctx.user.id, tenantId: ctx.tenantId } },
      create: {
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        ...data,
      },
      update: data,
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "EMAIL_PREFERENCE_UPDATED",
      entityType: "EmailPreference",
      entityId: ctx.user.id,
      metadata: JSON.parse(JSON.stringify(data)),
    });

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[updateEmailPreferences] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Mentor Question Notification ──────────────────────────────────────────

/**
 * Send email notification to mentors when a question is posted in module chat.
 * Fire-and-forget — errors are logged but not surfaced.
 * Dedup: max 1 email per mentor per module per 30-minute window.
 */
export async function sendMentorQuestionNotification(opts: {
  moduleId: string;
  tenantId: string;
  senderName: string;
  messagePreview: string;
}): Promise<void> {
  try {
    // Find all mentors for this module
    const mentors = await prisma.moduleMentor.findMany({
      where: { moduleId: opts.moduleId, tenantId: opts.tenantId },
      include: {
        user: { select: { id: true, email: true, firstName: true, isActive: true } },
      },
    });

    if (mentors.length === 0) return;

    // Get module title + tenant name
    const [module, tenant] = await Promise.all([
      prisma.module.findUnique({
        where: { id: opts.moduleId },
        select: { title: true },
      }),
      prisma.tenant.findUnique({
        where: { id: opts.tenantId },
        select: { name: true, locale: true },
      }),
    ]);

    if (!module || !tenant) return;

    const locale = (tenant.locale === "en" ? "en" : "sl") as Locale;
    const defaults = EMAIL_DEFAULTS[locale] ?? EMAIL_DEFAULTS.sl;

    // Dedup key: 30-minute window
    const now = new Date();
    const halfHourSlot = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${Math.floor(now.getUTCMinutes() / 30)}`;

    for (const mentor of mentors) {
      if (!mentor.user.isActive) continue;

      // Check email preference
      const pref = await prisma.emailPreference.findUnique({
        where: { userId_tenantId: { userId: mentor.user.id, tenantId: opts.tenantId } },
        select: { mentorQuestion: true },
      });
      // Default is INSTANT; skip if MUTED
      if (pref?.mentorQuestion === "MUTED") continue;

      // Check dedup
      const existing = await prisma.notificationDedup.findUnique({
        where: {
          userId_type_entityId_dedupKey: {
            userId: mentor.user.id,
            type: "NEW_MODULE", // Reuse existing enum value for mentor question dedup
            entityId: opts.moduleId,
            dedupKey: `mentor-q-${halfHourSlot}`,
          },
        },
      });
      if (existing) continue;

      // Build email
      const moduleUrl = `${getAppUrl()}/modules/${opts.moduleId}`;
      const subject = renderTemplate(defaults.mentorQuestionSubject, {
        moduleTitle: module.title,
        tenantName: tenant.name,
      });
      const body = renderTemplate(defaults.mentorQuestionBody, {
        firstName: mentor.user.firstName,
        moduleTitle: module.title,
        senderName: opts.senderName,
        messagePreview: opts.messagePreview.slice(0, 200),
        link: moduleUrl,
        tenantName: tenant.name,
      });

      // Append unsubscribe footer + List-Unsubscribe header
      const footer = await buildEmailFooter(mentor.user.id, opts.tenantId, "mentorQuestion", locale);

      await sendEmail({
        to: mentor.user.email,
        subject,
        text: body + footer.text,
        headers: { "List-Unsubscribe": `<${footer.unsubscribeUrl}>` },
      });

      // Record dedup
      await prisma.notificationDedup.create({
        data: {
          userId: mentor.user.id,
          tenantId: opts.tenantId,
          type: "NEW_MODULE",
          entityId: opts.moduleId,
          dedupKey: `mentor-q-${halfHourSlot}`,
        },
      });
    }
  } catch (err) {
    console.error("[sendMentorQuestionNotification] Error:", err);
  }
}

// ── Knowledge Instant Notification ────────────────────────────────────────

/**
 * Send instant notification when a module is published, to users with
 * newKnowledgeDigest = "INSTANT" preference.
 * Fire-and-forget — errors are logged but not surfaced.
 */
export async function sendKnowledgeInstantNotification(opts: {
  moduleId: string;
  moduleTitle: string;
  tenantId: string;
}): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { name: true, locale: true },
    });
    if (!tenant) return;

    const locale = (tenant.locale === "en" ? "en" : "sl") as Locale;
    const defaults = EMAIL_DEFAULTS[locale] ?? EMAIL_DEFAULTS.sl;

    // Find assigned users via ModuleGroup → UserGroup
    const moduleGroups = await prisma.moduleGroup.findMany({
      where: { moduleId: opts.moduleId },
      include: {
        group: {
          include: {
            users: {
              select: {
                userId: true,
                user: { select: { id: true, email: true, firstName: true, isActive: true } },
              },
            },
          },
        },
      },
    });

    // Collect unique users
    const usersMap = new Map<string, { id: string; email: string; firstName: string }>();
    for (const mg of moduleGroups) {
      for (const ug of mg.group.users) {
        if (ug.user.isActive && !usersMap.has(ug.userId)) {
          usersMap.set(ug.userId, ug.user);
        }
      }
    }

    const moduleUrl = `${getAppUrl()}/modules/${opts.moduleId}`;

    for (const [userId, user] of usersMap) {
      // Check email preference — only send to INSTANT
      const pref = await prisma.emailPreference.findUnique({
        where: { userId_tenantId: { userId, tenantId: opts.tenantId } },
        select: { newKnowledgeDigest: true },
      });
      // Default is DAILY, so only send if explicitly INSTANT
      if (pref?.newKnowledgeDigest !== "INSTANT") continue;

      // Dedup
      const existing = await prisma.notificationDedup.findUnique({
        where: {
          userId_type_entityId_dedupKey: {
            userId,
            type: "NEW_KNOWLEDGE",
            entityId: opts.moduleId,
            dedupKey: `instant-${opts.moduleId}`,
          },
        },
      });
      if (existing) continue;

      const subject = renderTemplate(defaults.knowledgeInstantSubject, {
        moduleTitle: opts.moduleTitle,
        tenantName: tenant.name,
      });
      const body = renderTemplate(defaults.knowledgeInstantBody, {
        firstName: user.firstName,
        moduleTitle: opts.moduleTitle,
        link: moduleUrl,
        tenantName: tenant.name,
      });

      const footer = await buildEmailFooter(userId, opts.tenantId, "newKnowledgeDigest", locale);

      await sendEmail({
        to: user.email,
        subject,
        text: body + footer.text,
        headers: { "List-Unsubscribe": `<${footer.unsubscribeUrl}>` },
      });

      await prisma.notificationDedup.create({
        data: {
          userId,
          tenantId: opts.tenantId,
          type: "NEW_KNOWLEDGE",
          entityId: opts.moduleId,
          dedupKey: `instant-${opts.moduleId}`,
        },
      });
    }
  } catch (err) {
    console.error("[sendKnowledgeInstantNotification] Error:", err);
  }
}

// ---------------------------------------------------------------------------
// sendLiveEventCreatedNotification — notify group members when a live event is created
// ---------------------------------------------------------------------------
export async function sendLiveEventCreatedNotification(opts: {
  eventId: string;
  tenantId: string;
  groupIds: string[];
  eventTitle: string;
  startsAt: Date;
  meetUrl: string;
}): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: { name: true, locale: true },
    });
    if (!tenant) return;

    const locale = (tenant.locale === "en" ? "en" : "sl") as Locale;
    const defaults = EMAIL_DEFAULTS[locale] ?? EMAIL_DEFAULTS.sl;

    // Find unique users across all selected groups
    const userGroups = await prisma.userGroup.findMany({
      where: {
        groupId: { in: opts.groupIds },
        tenantId: opts.tenantId,
      },
      select: {
        userId: true,
        user: { select: { id: true, email: true, firstName: true, isActive: true } },
      },
    });

    // Deduplicate users (a user may be in multiple groups)
    const usersMap = new Map<string, { id: string; email: string; firstName: string }>();
    for (const ug of userGroups) {
      if (ug.user.isActive && !usersMap.has(ug.userId)) {
        usersMap.set(ug.userId, ug.user);
      }
    }

    const { format } = await import("date-fns");
    const { getDateLocale } = await import("@/lib/i18n/date-locale");
    const { setLocale } = await import("@/lib/i18n");
    setLocale(locale);

    const formattedDate = format(opts.startsAt, "d. MMMM yyyy 'ob' HH:mm", {
      locale: getDateLocale(),
    });

    for (const [userId, user] of usersMap) {
      // Check email preference
      const pref = await prisma.emailPreference.findUnique({
        where: { userId_tenantId: { userId, tenantId: opts.tenantId } },
        select: { liveTrainingReminder: true },
      });
      // Default is true; skip if explicitly false
      if (pref && !pref.liveTrainingReminder) continue;

      // Dedup: one notification per event creation per user
      const dedupKey = `live-created-${opts.eventId}`;
      const existing = await prisma.notificationDedup.findUnique({
        where: {
          userId_type_entityId_dedupKey: {
            userId,
            type: "SYSTEM",
            entityId: opts.eventId,
            dedupKey,
          },
        },
      });
      if (existing) continue;

      const subject = renderTemplate(defaults.liveCreatedSubject, {
        eventTitle: opts.eventTitle,
        startsAt: formattedDate,
        tenantName: tenant.name,
      });
      const body = renderTemplate(defaults.liveCreatedBody, {
        firstName: user.firstName,
        eventTitle: opts.eventTitle,
        startsAt: formattedDate,
        meetUrl: opts.meetUrl,
        tenantName: tenant.name,
      });

      const footer = await buildEmailFooter(userId, opts.tenantId, "liveTrainingReminder", locale);

      await sendEmail({
        to: user.email,
        subject,
        text: body + footer.text,
        headers: { "List-Unsubscribe": `<${footer.unsubscribeUrl}>` },
      });

      await prisma.notificationDedup.create({
        data: {
          userId,
          tenantId: opts.tenantId,
          type: "SYSTEM",
          entityId: opts.eventId,
          dedupKey,
        },
      });
    }
  } catch (err) {
    console.error("[sendLiveEventCreatedNotification] Error:", err);
  }
}
