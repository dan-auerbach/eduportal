import { Resend } from "resend";
import { SignJWT, jwtVerify } from "jose";

// ── Resend client (lazy init to avoid build errors without API key) ──────────

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@mentor.mojimediji.si";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// ── Secret for JWT (reuse AUTH_SECRET from next-auth) ────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is required for email tokens");
  return new TextEncoder().encode(secret);
}

// ── Plain text → minimal HTML ────────────────────────────────────────────────

/**
 * Convert plain text email body to minimal HTML.
 * - Escapes HTML entities
 * - Converts URLs to clickable <a> links
 * - Converts newlines to <br>
 * Wraps in a basic HTML document for consistent rendering.
 */
function textToHtml(text: string): string {
  // 1. Escape HTML entities
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

  // 2. Convert URLs to clickable links (must come before newline conversion)
  html = html.replace(
    /(https?:\/\/[^\s<>"']+)/g,
    '<a href="$1" style="color:#2563eb;word-break:break-all;">$1</a>',
  );

  // 3. Convert newlines to <br>
  html = html.replace(/\n/g, "<br>\n");

  // 4. Wrap in minimal HTML document
  return [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head>',
    '<body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:600px;margin:0 auto;padding:20px;">',
    html,
    '</body></html>',
  ].join("");
}

// ── Send email ───────────────────────────────────────────────────────────────

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email send to:", opts.to);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const html = textToHtml(opts.text);

  try {
    const { data, error } = await getResend().emails.send({
      from: EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html,
      headers: opts.headers,
    });

    if (error) {
      console.error("[email] Resend error:", error);

      // Retry once on transient errors
      if (error.name === "rate_limit_exceeded" || error.name === "internal_server_error") {
        await new Promise((r) => setTimeout(r, 1000));
        const retry = await getResend().emails.send({
          from: EMAIL_FROM,
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
          html,
          headers: opts.headers,
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
 * Returns both the footer text and the unsubscribe URL (for List-Unsubscribe header).
 */
export async function buildEmailFooter(
  userId: string,
  tenantId: string,
  unsubscribeType: string,
  locale: "sl" | "en" = "sl",
): Promise<{ text: string; unsubscribeUrl: string }> {
  const preferencesUrl = `${APP_URL}/profile`;
  const unsubscribeUrl = await buildUnsubscribeUrl(userId, tenantId, unsubscribeType);

  let text: string;
  if (locale === "sl") {
    text = [
      "",
      "---",
      `Za upravljanje email obvestil: ${preferencesUrl}`,
      `Za odjavo od teh obvestil: ${unsubscribeUrl}`,
    ].join("\n");
  } else {
    text = [
      "",
      "---",
      `Manage email notifications: ${preferencesUrl}`,
      `Unsubscribe from these notifications: ${unsubscribeUrl}`,
    ].join("\n");
  }

  return { text, unsubscribeUrl };
}

// ── App URL helper ───────────────────────────────────────────────────────────

/** Get the public app URL */
export function getAppUrl(): string {
  return APP_URL;
}
