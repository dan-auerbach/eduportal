"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenantSettings } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogoUpload } from "@/components/ui/logo-upload";
import { t } from "@/lib/i18n";
import type { TenantTheme } from "@/generated/prisma/client";
import type { Locale } from "@/lib/i18n";
import { SUPPORTED_LOCALES } from "@/lib/i18n";

interface SettingsFormProps {
  defaultValues: {
    logoUrl: string | null;
    theme: TenantTheme;
    locale: Locale;
  };
}

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<TenantTheme>(defaultValues.theme);
  const [logoUrl, setLogoUrl] = useState<string | null>(defaultValues.logoUrl);
  const [locale, setLocale] = useState<Locale>(defaultValues.locale);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const result = await updateTenantSettings({ logoUrl, theme, locale });

    if (result.success) {
      toast.success(t("tenant.updated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>{t("tenant.logo")}</Label>
        <LogoUpload value={logoUrl} onChange={setLogoUrl} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="theme">{t("tenant.theme")}</Label>
        <Select value={theme} onValueChange={(v) => setTheme(v as TenantTheme)}>
          <SelectTrigger>
            <SelectValue placeholder={t("tenant.theme")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEFAULT">{t("tenant.themes.DEFAULT")}</SelectItem>
            <SelectItem value="OCEAN">{t("tenant.themes.OCEAN")}</SelectItem>
            <SelectItem value="SUNSET">{t("tenant.themes.SUNSET")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="locale">{t("locale.label")}</Label>
        <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          <SelectTrigger>
            <SelectValue placeholder={t("locale.label")} />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_LOCALES.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {t(`locale.${loc}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
