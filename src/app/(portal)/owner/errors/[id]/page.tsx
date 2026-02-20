import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";

type Params = Promise<{ id: string }>;

export default async function OwnerErrorDetailPage({
  params,
}: {
  params: Params;
}) {
  const { id } = await params;

  const error = await prisma.systemError.findUnique({
    where: { id },
  });

  if (!error) {
    notFound();
  }

  const dateLocale = getDateLocale();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/owner/errors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t("owner.errors.detail")}</h1>
          <p className="text-sm text-muted-foreground font-mono">{error.requestId}</p>
        </div>
      </div>

      {/* Info grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {error.route}
            <Badge
              variant={error.severity === "ERROR" ? "destructive" : "secondary"}
              className="text-xs"
            >
              {error.severity}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs font-medium">{t("owner.errors.time")}</dt>
              <dd>{format(error.createdAt, "d. MMMM yyyy HH:mm:ss", { locale: dateLocale })}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">{t("owner.errors.requestId")}</dt>
              <dd className="font-mono text-xs">{error.requestId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">{t("owner.errors.route")}</dt>
              <dd className="font-mono">{error.route}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">{t("owner.errors.severity")}</dt>
              <dd>{error.severity}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">{t("owner.errors.tenant")}</dt>
              <dd>{error.tenantSlug ?? error.tenantId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs font-medium">User ID</dt>
              <dd className="font-mono text-xs">{error.userId ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Message */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("owner.errors.message")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{error.message}</p>
        </CardContent>
      </Card>

      {/* Stack trace */}
      {error.stack && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("owner.errors.stack")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto bg-muted p-4 rounded text-xs leading-relaxed max-h-[500px]">
              {error.stack}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Meta */}
      {error.meta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("owner.errors.meta")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto bg-muted p-4 rounded text-xs leading-relaxed max-h-[300px]">
              {JSON.stringify(error.meta, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
