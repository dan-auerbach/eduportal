import { getTenantContext, hasMinRole } from "@/lib/tenant";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { t } from "@/lib/i18n";
import { SettingsForm } from "./settings-form";
import { EmailTemplatesForm } from "./email-templates-form";
import { FeatureTogglesForm } from "./feature-toggles-form";
import { XpConfigForm } from "./xp-config-form";
import { RankConfigForm } from "./rank-config-form";

export default async function AdminSettingsPage() {
  const ctx = await getTenantContext();

  // Require at least SUPER_ADMIN
  if (!hasMinRole(ctx.effectiveRole, "SUPER_ADMIN")) {
    redirect("/dashboard");
  }

  const config = ctx.config;

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

      {/* Tabbed settings */}
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Splošno</TabsTrigger>
          <TabsTrigger value="gamification">Gamifikacija</TabsTrigger>
          <TabsTrigger value="features">Funkcionalnosti</TabsTrigger>
          <TabsTrigger value="email">Email predloge</TabsTrigger>
        </TabsList>

        {/* General */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>{t("common.edit")}</CardTitle>
              <CardDescription>Logotip, tema in jezik podjetja</CardDescription>
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
        </TabsContent>

        {/* Gamification */}
        <TabsContent value="gamification" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>XP točkovanje</CardTitle>
              <CardDescription>Koliko XP točk se dodeli za posamezno akcijo</CardDescription>
            </CardHeader>
            <CardContent>
              <XpConfigForm
                xpRules={config.xpRules}
                quizHighScorePercent={config.quizHighScorePercent}
                suggestionVoteThreshold={config.suggestionVoteThreshold}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rangi</CardTitle>
              <CardDescription>Imena rangov in pragovi XP za napredovanje</CardDescription>
            </CardHeader>
            <CardContent>
              <RankConfigForm rankThresholds={config.rankThresholds} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Features */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle>Funkcionalnosti</CardTitle>
              <CardDescription>Vklopite ali izklopite posamezne funkcionalnosti platforme</CardDescription>
            </CardHeader>
            <CardContent>
              <FeatureTogglesForm features={config.features} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email templates */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>{t("emailTemplates.title")}</CardTitle>
              <CardDescription>{t("emailTemplates.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent>
              <EmailTemplatesForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
