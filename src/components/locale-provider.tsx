"use client";

import { useEffect } from "react";
import { setLocale, type Locale } from "@/lib/i18n";

/**
 * Client-side locale initializer.
 * Sets the module-level active locale so that t() calls in client components
 * resolve to the correct dictionary.
 *
 * Must be rendered inside the portal layout, before any client components
 * that call t().
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  // Set immediately during render (synchronous) so the first paint is correct
  setLocale(locale);

  // Also set in effect for any late-mounting client components
  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  return <>{children}</>;
}
