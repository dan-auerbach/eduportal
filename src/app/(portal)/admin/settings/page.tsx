import { getTenantContext, hasMinRole } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import { SettingsForm } from "./settings-form";
import { EmailTemplatesForm } from "./email-templates-form";

export default async function AdminSettingsPage() {
  const ctx = await getTenantContext();

  // Require at least SUPER_ADMIN
  if (!hasMinRole(ctx.effectiveRole, "SUPER_ADMIN")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("tenant.settings")}</h1>
        <p className="text-muted-foreground">{t("tenant.settingsSubtitle")}</p>
      </div>

      {/* Current settings overview */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tenant.title")}</CardTitle>
          <CardDescription>{ctx.tenantName} (/{ctx.tenantSlug})</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("tenant.theme")}:</span>
            <Badge variant="outline">{t(`tenant.themes.${ctx.tenantTheme}`)}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t("locale.label")}:</span>
            <Badge variant="outline">{t(`locale.${ctx.tenantLocale}`)}</Badge>
          </div>
          {ctx.tenantLogoUrl && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t("tenant.logo")}:</span>
              <span className="text-sm text-muted-foreground truncate max-w-xs">
                {ctx.tenantLogoUrl}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("common.edit")}</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm
            defaultValues={{
              logoUrl: ctx.tenantLogoUrl,
              theme: ctx.tenantTheme,
              locale: ctx.tenantLocale,
            }}
          />
        </CardContent>
      </Card>

      {/* Email templates */}
      <Card>
        <CardHeader>
          <CardTitle>{t("emailTemplates.title")}</CardTitle>
          <CardDescription>{t("emailTemplates.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmailTemplatesForm />
        </CardContent>
      </Card>
    </div>
  );
}
