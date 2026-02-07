import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { Award, ExternalLink, BookOpen } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function CertificatesPage() {
  const ctx = await getTenantContext();
  const user = ctx.user;

  const certificates = await prisma.certificate.findMany({
    where: { userId: user.id, tenantId: ctx.tenantId },
    include: {
      module: {
        select: {
          id: true,
          title: true,
          description: true,
          difficulty: true,
          estimatedTime: true,
        },
      },
    },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("certificates.title")}</h1>
        <p className="text-muted-foreground">
          {t("certificates.subtitle")}
        </p>
      </div>

      {certificates.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Award className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{t("certificates.noCertificates")}</p>
            <p className="text-sm mt-1">
              {t("certificates.completeTip")}
            </p>
            <Button variant="outline" size="sm" className="mt-4" asChild>
              <Link href="/modules">{t("certificates.browseModules")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((cert) => (
            <Card
              key={cert.id}
              className="flex flex-col overflow-hidden border-border/60 transition-all hover:shadow-md hover:border-primary/20"
            >
              {/* Gold accent top strip */}
              <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />

              {/* Certificate body */}
              <CardContent className="flex flex-col flex-1 p-6 space-y-4">
                {/* Award icon + module title */}
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-amber-50 dark:bg-amber-950/40 p-2.5 shrink-0">
                    <Award className="h-5 w-5 text-amber-500" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold leading-tight line-clamp-2">
                      {cert.module.title}
                    </h3>
                    <Badge variant="secondary" className="text-xs">
                      {t(`difficulty.${cert.module.difficulty}`)}
                    </Badge>
                  </div>
                </div>

                {/* Issue date */}
                <p className="text-sm text-muted-foreground">
                  {t("certificates.issuedOn", {
                    date: format(cert.issuedAt, "d. MMMM yyyy", { locale: getDateLocale() }),
                  })}
                </p>

                {/* Spacer to push buttons down */}
                <div className="flex-1" />

                {/* Action buttons — stacked to avoid overflow */}
                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/modules/${cert.module.id}`}>
                      <BookOpen className="h-3.5 w-3.5 mr-1.5" />
                      {t("certificates.viewModule")}
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                    <Link
                      href={`/verify/${cert.uniqueCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      {t("certificates.verify")}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
