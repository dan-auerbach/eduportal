"use server";

import crypto from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail, renderTemplate, getAppUrl } from "@/lib/email";
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
