"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenant } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface TenantEditFormProps {
  tenantId: string;
  defaultValues: {
    name: string;
    slug: string;
    logoUrl: string | null;
    theme: TenantTheme;
  };
}

export function TenantEditForm({ tenantId, defaultValues }: TenantEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<TenantTheme>(defaultValues.theme);
  const [logoUrl, setLogoUrl] = useState<string | null>(defaultValues.logoUrl);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      logoUrl: logoUrl || undefined,
      theme,
    };

    const result = await updateTenant(tenantId, data);

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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{t("tenant.name")}</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaultValues.name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">{t("tenant.slug")}</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={defaultValues.slug}
            required
          />
        </div>
      </div>

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

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
