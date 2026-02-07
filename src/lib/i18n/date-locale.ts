import { sl } from "date-fns/locale/sl";
import { enUS } from "date-fns/locale/en-US";
import type { Locale as DateFnsLocale } from "date-fns";
import { getLocale, type Locale } from "./index";

const DATE_LOCALES: Record<Locale, DateFnsLocale> = {
  sl,
  en: enUS,
};

/**
 * Get the date-fns locale object for the currently active i18n locale.
 * Use this instead of importing date-fns locale directly.
 */
export function getDateLocale(): DateFnsLocale {
  return DATE_LOCALES[getLocale()] ?? enUS;
}
