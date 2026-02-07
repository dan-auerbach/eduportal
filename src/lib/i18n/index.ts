import { sl } from "./sl";
import { en } from "./en";

// ── Types ─────────────────────────────────────────────────────────────────────

type NestedRecord = { [key: string]: string | NestedRecord };

/** All supported locale codes */
export type Locale = "en" | "sl";

/** Dictionary type — recursive string map (widened from literal types) */
export type Dictionary = NestedRecord;

// ── Locale registry ───────────────────────────────────────────────────────────

const dictionaries: Record<Locale, Dictionary> = {
  sl: sl as Dictionary,
  en: en as Dictionary,
};

export const SUPPORTED_LOCALES: Locale[] = ["en", "sl"];
export const DEFAULT_LOCALE: Locale = "en";

// ── Active locale (module-level, set per-request on server / once on client) ─

let activeLocale: Locale = DEFAULT_LOCALE;

/**
 * Set the active locale for the current request / client session.
 * Called from the portal layout (server) and LocaleProvider (client).
 */
export function setLocale(locale: Locale): void {
  activeLocale = locale;
}

/** Get the currently active locale */
export function getLocale(): Locale {
  return activeLocale;
}

// ── Translation function ──────────────────────────────────────────────────────

/**
 * Resolve a dot-separated key from the active locale's dictionary.
 *
 * Usage:
 *   t("dashboard.welcome", { name: "John" })
 *   // → "Welcome back, John!"
 *
 *   t("common.save")
 *   // → "Save" (en) / "Shrani" (sl)
 *
 * If the key does not exist in the active locale, the English dictionary is
 * tried as fallback. If that also misses, the raw key string is returned.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const result = resolveKey(dictionaries[activeLocale], key)
    ?? resolveKey(dictionaries[DEFAULT_LOCALE], key)
    ?? key;

  if (!params) return result;

  let interpolated = result;
  for (const [paramKey, paramValue] of Object.entries(params)) {
    interpolated = interpolated.replace(
      new RegExp(`\\{${paramKey}\\}`, "g"),
      String(paramValue),
    );
  }
  return interpolated;
}

/** Walk a nested dictionary to resolve a dot-separated key */
function resolveKey(dict: Dictionary, key: string): string | null {
  const parts = key.split(".");
  let current: unknown = dict;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return null;
    }
    current = (current as NestedRecord)[part];
  }

  return typeof current === "string" ? current : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get the date-fns locale identifier for the active locale */
export function getDateLocaleId(): string {
  return activeLocale;
}

/** Check if a string is a valid supported locale */
export function isValidLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

// Re-export dictionaries for direct access when needed
export { sl, en };
