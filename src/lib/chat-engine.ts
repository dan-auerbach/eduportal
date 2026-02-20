/**
 * Shared chat engine utilities extracted from both chat-room components.
 * Used by the unified ChatThread component.
 */

import type { ChatScope } from "@/hooks/use-chat";

// Re-export ChatScope for convenience
export type { ChatScope };

// ── Theme definitions ────────────────────────────────────────────────────────

export type IrcTheme = "light" | "dark";

export const THEMES = {
  light: {
    bg: "#ffffff",
    headerBg: "#f5f5f5",
    headerBorder: "#d4d4d4",
    inputBg: "#f5f5f5",
    inputBorder: "#c0c0c0",
    inputText: "#1a1a1a",
    inputPlaceholder: "#999999",
    inputBarBg: "#f0f0f0",
    text: "#1a1a1a",
    textMe: "#000000",
    timestamp: "#808080",
    system: "#cc7700",
    action: "#990099",
    channel: "#0000cc",
    emptyText: "#999999",
    badgeBg: "#0066cc",
    badgeText: "#ffffff",
    sendBg: "#0066cc",
    sendText: "#ffffff",
    focusRing: "#0066cc",
    topicBg: "#f8f8e0",
    topicText: "#666600",
    topicBorder: "#e0e0a0",
    mentionBg: "#fff3cd",
    mentionText: "#856404",
    helpBg: "#f5f5f5",
    helpBorder: "#d4d4d4",
    helpText: "#333333",
    helpCmd: "#0066cc",
    confirmedBg: "#d4edda",
    confirmedBorder: "#c3e6cb",
    confirmedText: "#155724",
    mentorColor: "#0066cc",
    confirmBtnBg: "#28a745",
    confirmBtnText: "#ffffff",
  },
  dark: {
    bg: "#0b0f14",
    headerBg: "#0b0f14",
    headerBorder: "#1e2530",
    inputBg: "#161b22",
    inputBorder: "#30363d",
    inputText: "#d1d5db",
    inputPlaceholder: "#5c6370",
    inputBarBg: "#0d1117",
    text: "#d1d5db",
    textMe: "#e8ecf1",
    timestamp: "#5c6370",
    system: "#e5c07b",
    action: "#c678dd",
    channel: "#61afef",
    emptyText: "#5c6370",
    badgeBg: "#61afef",
    badgeText: "#0b0f14",
    sendBg: "#61afef",
    sendText: "#0b0f14",
    focusRing: "#61afef",
    topicBg: "#1a1d23",
    topicText: "#e5c07b",
    topicBorder: "#30363d",
    mentionBg: "#3d2e00",
    mentionText: "#e5c07b",
    helpBg: "#161b22",
    helpBorder: "#30363d",
    helpText: "#d1d5db",
    helpCmd: "#61afef",
    confirmedBg: "#0d2818",
    confirmedBorder: "#1a3a2a",
    confirmedText: "#98c379",
    mentorColor: "#61afef",
    confirmBtnBg: "#28a745",
    confirmBtnText: "#ffffff",
  },
} as const;

// ── Nick colors ──────────────────────────────────────────────────────────────

const NICK_COLORS_LIGHT = [
  "#cc0000", "#0000cc", "#990099", "#cc6600", "#009999",
  "#009900", "#666699", "#cc0066", "#336600", "#6600cc",
];

const NICK_COLORS_DARK = [
  "#e06c75", "#61afef", "#c678dd", "#e5c07b", "#56b6c2",
  "#98c379", "#d19a66", "#be5046",
];

export function hashColor(name: string, theme: IrcTheme): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = theme === "light" ? NICK_COLORS_LIGHT : NICK_COLORS_DARK;
  return palette[Math.abs(hash) % palette.length];
}

// ── HTML escape ──────────────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── URL detection ────────────────────────────────────────────────────────────

export const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

// ── Mention detection ────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMentionPatterns(
  displayName: string,
  firstName?: string,
  lastName?: string,
): RegExp[] {
  const patterns: RegExp[] = [];
  if (displayName) {
    patterns.push(new RegExp(`@${escapeRegex(displayName)}\\b`, "i"));
    patterns.push(new RegExp(`\\b${escapeRegex(displayName)}\\b`, "i"));
  }
  if (firstName && lastName) {
    const spaced = `${firstName} ${lastName}`;
    patterns.push(new RegExp(`@${escapeRegex(spaced)}\\b`, "i"));
    patterns.push(new RegExp(`\\b${escapeRegex(spaced)}\\b`, "i"));
  }
  if (firstName && firstName.toLowerCase() !== displayName.toLowerCase()) {
    patterns.push(new RegExp(`@${escapeRegex(firstName)}\\b`, "i"));
  }
  return patterns;
}

export function containsMention(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

// ── Time formatting ──────────────────────────────────────────────────────────

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// ── Channel name ─────────────────────────────────────────────────────────────

export function channelName(scope: ChatScope, tenantSlug: string, moduleTitle?: string): string {
  if (scope.kind === "TENANT") {
    return `#${tenantSlug}`;
  }
  const slug = (moduleTitle ?? "chat")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9čšžđćñ-]/gi, "")
    .slice(0, 30);
  return `#${slug}`;
}

// ── localStorage helpers ─────────────────────────────────────────────────────

const THEME_KEY = "ircTheme";
const LAST_READ_TENANT_PREFIX = "ircLastRead:";
const LAST_READ_MODULE_PREFIX = "ircModuleLastRead:";

export function getStoredTheme(): IrcTheme {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // ignore
  }
  return "light";
}

export function setStoredTheme(theme: IrcTheme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function getLastRead(scope: ChatScope, tenantId: string): string | null {
  try {
    const key = scope.kind === "TENANT"
      ? `${LAST_READ_TENANT_PREFIX}${tenantId}`
      : `${LAST_READ_MODULE_PREFIX}${(scope as { kind: "MODULE"; moduleId: string }).moduleId}`;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setLastRead(scope: ChatScope, tenantId: string, messageId: string): void {
  try {
    const key = scope.kind === "TENANT"
      ? `${LAST_READ_TENANT_PREFIX}${tenantId}`
      : `${LAST_READ_MODULE_PREFIX}${(scope as { kind: "MODULE"; moduleId: string }).moduleId}`;
    localStorage.setItem(key, messageId);
  } catch {
    // ignore
  }
}
