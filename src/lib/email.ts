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
const EMAIL_FROM = (process.env.EMAIL_FROM || "Mentor <mentor@mentor.mojimediji.si>").trim();
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").trim();

// ── Secret for JWT (reuse AUTH_SECRET from next-auth) ────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is required for email tokens");
  return new TextEncoder().encode(secret);
}

// ── Plain text → minimal HTML ────────────────────────────────────────────────

/**
 * Convert plain text email body to minimal HTML.
 *
 * IMPORTANT: Each output line must stay under ~78 characters to avoid SMTP
 * line-wrapping that can break <a href="…"> attributes. We achieve this by
 * emitting each paragraph/link on its own short line.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string): string {
  const lines = text.split("\n");
  const bodyLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      bodyLines.push("<br>");
      continue;
    }

    // Split line by URLs
    const parts = line.split(/(https?:\/\/[^\s<>"']+)/g);
    const segments: string[] = [];

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // URL — render as a styled CTA button.
        // Inline styles are on <td> to keep the <a> tag short (under ~200 chars)
        // and avoid SMTP line-wrapping that breaks href attributes.
        const url = parts[i];
        const label = url.replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/");
        const tdStyle = [
          "background-color:#2563eb;",
          "border-radius:6px;",
          "padding:10px 20px;",
          "font-weight:500;",
          "text-align:center;",
        ].join("");
        const aStyle = "color:#ffffff;text-decoration:none;";
        segments.push(
          [
            "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\">",
            "<tr>",
            `<td style="${tdStyle}">`,
            `<a href="${url}" target="_blank" style="${aStyle}">`,
            `${escapeHtml(label)} &rarr;</a>`,
            "</td>",
            "</tr>",
            "</table>",
          ].join("\n"),
        );
      } else if (parts[i]) {
        segments.push(`<p style="margin:0;">${escapeHtml(parts[i])}</p>`);
      }
    }

    bodyLines.push(segments.join("\n"));
  }

  const bodyStyle = [
    "font-family:sans-serif;",
    "font-size:14px;",
    "line-height:1.6;",
    "color:#1a1a1a;",
    "max-width:600px;",
    "margin:0 auto;",
    "padding:20px;",
  ].join("");

  return [
    "<!DOCTYPE html>",
    "<html>",
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    "</head>",
    `<body style="${bodyStyle}">`,
    ...bodyLines,
    "</body>",
    "</html>",
  ].join("\n");
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

  // Convert plain text to HTML with styled CTA buttons for URLs.
  // Send both html + text so email clients can choose the best format:
  // - Modern clients render HTML with clickable buttons
  // - Plain text clients / accessibility tools show the original text with full URLs
  const html = textToHtml(opts.text);

  const payload = {
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html,
    text: opts.text,
    headers: opts.headers,
  };

  try {
    const { data, error } = await getResend().emails.send(payload);

    if (error) {
      console.error("[email] Resend error:", error);

      // Retry once on transient errors
      if (error.name === "rate_limit_exceeded" || error.name === "internal_server_error") {
        await new Promise((r) => setTimeout(r, 1000));
        const retry = await getResend().emails.send(payload);
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
