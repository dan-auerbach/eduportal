import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { CheckCircle2, XCircle, Shield } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { t, setLocale, isValidLocale, DEFAULT_LOCALE } from "@/lib/i18n";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Params = Promise<{ code: string }>;

export default async function VerifyCertificatePage({
  params,
}: {
  params: Params;
}) {
  const { code } = await params;

  const certificate = await prisma.certificate.findUnique({
    where: { uniqueCode: code },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      module: {
        select: {
          title: true,
          description: true,
          difficulty: true,
          estimatedTime: true,
        },
      },
      tenant: {
        select: {
          locale: true,
        },
      },
    },
  });

  // Set locale from tenant (or default) — this is a public page outside the portal layout
  if (certificate) {
    setLocale(isValidLocale(certificate.tenant.locale) ? certificate.tenant.locale : DEFAULT_LOCALE);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        {certificate ? (
          <Card className="overflow-hidden">
            {/* Gold accent strip */}
            <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />

            <CardHeader className="text-center pb-4">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-xl">{t("certificates.verified")}</CardTitle>
              <CardDescription>
                {t("certificates.verifiedDesc")}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Separator />

              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">{t("certificates.awardedTo")}</p>
                <p className="text-lg font-semibold">
                  {certificate.user.firstName} {certificate.user.lastName}
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t("certificates.module")}</span>
                  <span className="text-sm font-medium text-right max-w-[60%]">
                    {certificate.module.title}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("certificates.difficulty")}
                  </span>
                  <Badge variant="secondary">
                    {t(`difficulty.${certificate.module.difficulty}`)}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("certificates.issuedOnLabel")}
                  </span>
                  <span className="text-sm font-medium">
                    {format(certificate.issuedAt, "d. MMMM yyyy", { locale: getDateLocale() })}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("certificates.codeLabel")}
                  </span>
                  <code className="text-xs font-mono bg-muted px-2 py-1 rounded">
                    {certificate.uniqueCode}
                  </code>
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                <span>{t("certificates.verifiedBy")}</span>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <CardTitle className="text-xl">{t("certificates.invalid")}</CardTitle>
              <CardDescription>
                {t("certificates.invalidDesc")}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="rounded-lg bg-muted p-3 text-center">
                <p className="text-sm text-muted-foreground">{t("certificates.codeProvided")}</p>
                <code className="text-sm font-mono">{code}</code>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
