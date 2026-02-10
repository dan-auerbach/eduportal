import { Resend } from "resend";
import { SignJWT, jwtVerify } from "jose";

// ── Resend client ────────────────────────────────────────────────────────────

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@mentor.mojimediji.si";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ── Secret for JWT (reuse AUTH_SECRET from next-auth) ────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is required for email tokens");
  return new TextEncoder().encode(secret);
}

// ── Send email ───────────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send to:", opts.to);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
    });

    if (error) {
      console.error("[email] Resend error:", error);

      // Retry once on transient errors
      if (error.name === "rate_limit_exceeded" || error.name === "internal_server_error") {
        await new Promise((r) => setTimeout(r, 1000));
        const retry = await resend.emails.send({
          from: EMAIL_FROM,
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
        });
        if (retry.error) {
          return { success: false, error: retry.error.message };
        }
        return { success: true, messageId: retry.data?.id };
      }

      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error("[email] Unexpected error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── Template rendering ───────────────────────────────────────────────────────

/**
 * Replace {varName} placeholders in a template string.
 * Unmatched placeholders are left as-is (visible in email for debugging).
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ── Unsubscribe JWT ──────────────────────────────────────────────────────────

/**
 * Build a one-click unsubscribe URL with a JWT token.
 * Token is valid for 90 days.
 */
export async function buildUnsubscribeUrl(
  userId: string,
  tenantId: string,
  type: string,
): Promise<string> {
  const token = await new SignJWT({ userId, tenantId, type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getJwtSecret());

  return `${APP_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`;
}

/**
 * Verify an unsubscribe JWT token.
 * Returns the decoded payload or null if invalid/expired.
 */
export async function verifyUnsubscribeToken(
  token: string,
): Promise<{ userId: string; tenantId: string; type: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const { userId, tenantId, type } = payload as {
      userId?: string;
      tenantId?: string;
      type?: string;
    };
    if (!userId || !tenantId || !type) return null;
    return { userId, tenantId, type };
  } catch {
    return null;
  }
}

// ── Email footer helper ──────────────────────────────────────────────────────

/**
 * Build the standard footer appended to notification emails.
 * Includes manage-preferences and one-click unsubscribe links.
 */
export async function buildEmailFooter(
  userId: string,
  tenantId: string,
  unsubscribeType: string,
  locale: "sl" | "en" = "sl",
): Promise<string> {
  const preferencesUrl = `${APP_URL}/profile`;
  const unsubscribeUrl = await buildUnsubscribeUrl(userId, tenantId, unsubscribeType);

  if (locale === "sl") {
    return [
      "",
      "---",
      `Za upravljanje email obvestil: ${preferencesUrl}`,
      `Za odjavo od teh obvestil: ${unsubscribeUrl}`,
    ].join("\n");
  }

  return [
    "",
    "---",
    `Manage email notifications: ${preferencesUrl}`,
    `Unsubscribe from these notifications: ${unsubscribeUrl}`,
  ].join("\n");
}

// ── App URL helper ───────────────────────────────────────────────────────────

/** Get the public app URL */
export function getAppUrl(): string {
  return APP_URL;
}
