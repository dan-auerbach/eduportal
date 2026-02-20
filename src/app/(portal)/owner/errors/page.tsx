import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";

type SearchParams = Promise<{
  route?: string;
  tenant?: string;
  severity?: string;
}>;

export default async function OwnerErrorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  // Build filter
  const where: Record<string, unknown> = {};
  if (params.route) where.route = params.route;
  if (params.tenant) where.tenantId = params.tenant;
  if (params.severity) where.severity = params.severity;

  const [errors, routes, tenantIds] = await Promise.all([
    prisma.systemError.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.systemError.findMany({
      select: { route: true },
      distinct: ["route"],
      orderBy: { route: "asc" },
    }),
    prisma.systemError.findMany({
      select: { tenantId: true, tenantSlug: true },
      distinct: ["tenantId"],
      where: { tenantId: { not: null } },
    }),
  ]);

  const dateLocale = getDateLocale();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("owner.errors.title")}</h1>
        <p className="text-muted-foreground">{t("owner.errors.subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label={t("owner.errors.allRoutes")}
          param="route"
          value={params.route}
          options={routes.map((r) => ({ value: r.route, label: r.route }))}
          currentParams={params}
        />
        <FilterSelect
          label={t("owner.errors.allTenants")}
          param="tenant"
          value={params.tenant}
          options={tenantIds
            .filter((te) => te.tenantId)
            .map((te) => ({
              value: te.tenantId!,
              label: te.tenantSlug ?? te.tenantId!.slice(0, 8),
            }))}
          currentParams={params}
        />
        <FilterSelect
          label={t("owner.errors.allSeverities")}
          param="severity"
          value={params.severity}
          options={[
            { value: "ERROR", label: "ERROR" },
            { value: "WARN", label: "WARN" },
          ]}
          currentParams={params}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("owner.errors.recentErrors")} ({errors.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mb-4 opacity-30" />
              <p>{t("owner.errors.noErrors")}</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">{t("owner.errors.time")}</TableHead>
                    <TableHead className="w-[100px]">{t("owner.errors.tenant")}</TableHead>
                    <TableHead className="w-[140px]">{t("owner.errors.route")}</TableHead>
                    <TableHead>{t("owner.errors.message")}</TableHead>
                    <TableHead className="w-[80px]">{t("owner.errors.severity")}</TableHead>
                    <TableHead className="w-[180px]">{t("owner.errors.requestId")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((err) => (
                    <TableRow key={err.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <Link href={`/owner/errors/${err.id}`} className="block">
                          {formatDistanceToNow(err.createdAt, {
                            addSuffix: true,
                            locale: dateLocale,
                          })}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link href={`/owner/errors/${err.id}`} className="block">
                          {err.tenantSlug ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        <Link href={`/owner/errors/${err.id}`} className="block">
                          {err.route}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px]">
                        <Link href={`/owner/errors/${err.id}`} className="block truncate">
                          {err.message.length > 80
                            ? `${err.message.slice(0, 80)}...`
                            : err.message}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/owner/errors/${err.id}`} className="block">
                          <Badge
                            variant={err.severity === "ERROR" ? "destructive" : "secondary"}
                            className="text-xs"
                          >
                            {err.severity}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        <Link href={`/owner/errors/${err.id}`} className="block">
                          {err.requestId.slice(0, 8)}...
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Filter Select Component ──────────────────────────────────────────────────

function FilterSelect({
  label,
  param,
  value,
  options,
  currentParams,
}: {
  label: string;
  param: string;
  value?: string;
  options: { value: string; label: string }[];
  currentParams: Record<string, string | undefined>;
}) {
  // Build URLs for each option
  const buildHref = (val?: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(currentParams)) {
      if (v && k !== param) params.set(k, v);
    }
    if (val) params.set(param, val);
    const qs = params.toString();
    return `/owner/errors${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={buildHref()}
        className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
          !value
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-muted-foreground border-border hover:bg-muted"
        }`}
      >
        {label}
      </Link>
      {options.map((opt) => (
        <Link
          key={opt.value}
          href={buildHref(opt.value)}
          className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted"
          }`}
        >
          {opt.label}
        </Link>
      ))}
    </div>
  );
}
