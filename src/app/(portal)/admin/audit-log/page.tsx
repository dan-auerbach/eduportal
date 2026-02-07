import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { AuditLogFilters } from "./audit-log-filters";
import { t } from "@/lib/i18n";
import type { AuditAction } from "@/generated/prisma/client";

const PAGE_SIZE = 25;

const actionColors: Record<string, string> = {
  USER_CREATED: "bg-green-100 text-green-800",
  USER_UPDATED: "bg-blue-100 text-blue-800",
  USER_DEACTIVATED: "bg-red-100 text-red-800",
  USER_DELETED: "bg-red-100 text-red-800",
  USER_LOGIN: "bg-gray-100 text-gray-800",
  MODULE_CREATED: "bg-green-100 text-green-800",
  MODULE_UPDATED: "bg-blue-100 text-blue-800",
  MODULE_PUBLISHED: "bg-emerald-100 text-emerald-800",
  MODULE_ARCHIVED: "bg-amber-100 text-amber-800",
  MODULE_ASSIGNED: "bg-indigo-100 text-indigo-800",
  SECTION_COMPLETED: "bg-green-100 text-green-800",
  QUIZ_ATTEMPTED: "bg-purple-100 text-purple-800",
  PROGRESS_OVERRIDDEN: "bg-orange-100 text-orange-800",
  CERTIFICATE_ISSUED: "bg-emerald-100 text-emerald-800",
  PERMISSION_GRANTED: "bg-blue-100 text-blue-800",
  PERMISSION_REVOKED: "bg-red-100 text-red-800",
  GROUP_CREATED: "bg-green-100 text-green-800",
  GROUP_UPDATED: "bg-blue-100 text-blue-800",
  DATA_EXPORTED: "bg-gray-100 text-gray-800",
  DATA_ANONYMIZED: "bg-gray-100 text-gray-800",
};

const allActions = [
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_DELETED",
  "USER_LOGIN",
  "USER_PASSWORD_RESET",
  "MODULE_CREATED",
  "MODULE_UPDATED",
  "MODULE_PUBLISHED",
  "MODULE_ARCHIVED",
  "MODULE_ASSIGNED",
  "SECTION_COMPLETED",
  "QUIZ_ATTEMPTED",
  "PROGRESS_OVERRIDDEN",
  "CERTIFICATE_ISSUED",
  "PERMISSION_GRANTED",
  "PERMISSION_REVOKED",
  "GROUP_CREATED",
  "GROUP_UPDATED",
  "DATA_EXPORTED",
  "DATA_ANONYMIZED",
];

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    action?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  if (ctx.user.role !== "OWNER") {
    throw new ForbiddenError("Nimate potrebnih pravic");
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1"));
  const filterAction = params.action || "";
  const filterFrom = params.from || "";
  const filterTo = params.to || "";

  // Build where clause (scoped to tenant)
  const where: Record<string, unknown> = { tenantId: ctx.tenantId };

  if (filterAction) {
    where.action = filterAction as AuditAction;
  }

  if (filterFrom || filterTo) {
    const createdAt: Record<string, Date> = {};
    if (filterFrom) createdAt.gte = new Date(filterFrom);
    if (filterTo) {
      const toDate = new Date(filterTo);
      toDate.setHours(23, 59, 59, 999);
      createdAt.lte = toDate;
    }
    where.createdAt = createdAt;
  }

  const [totalCount, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        actor: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    params.set("page", p.toString());
    if (filterAction) params.set("action", filterAction);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    return `/admin/audit-log?${params.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.auditLog.title")}</h1>
        <p className="text-muted-foreground">
          {t("admin.auditLog.subtitle")}
        </p>
      </div>

      <AuditLogFilters
        actions={allActions}
        selectedAction={filterAction}
        fromDate={filterFrom}
        toDate={filterTo}
      />

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.auditLog.tableTimestamp")}</TableHead>
              <TableHead>{t("admin.auditLog.tableActor")}</TableHead>
              <TableHead>{t("admin.auditLog.tableAction")}</TableHead>
              <TableHead>{t("admin.auditLog.tableEntity")}</TableHead>
              <TableHead>{t("admin.auditLog.tableDetails")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  {t("admin.auditLog.noEntries")}
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {format(
                      new Date(log.createdAt),
                      "d. MMM yyyy, HH:mm:ss",
                      { locale: getDateLocale() }
                    )}
                  </TableCell>
                  <TableCell>
                    {log.actor ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[10px]">
                            {log.actor.firstName[0]}
                            {log.actor.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {log.actor.firstName} {log.actor.lastName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {t("common.system")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        actionColors[log.action] ||
                        "bg-gray-100 text-gray-800"
                      }
                    >
                      {t(`auditActions.${log.action}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="text-muted-foreground">
                      {log.entityType}
                    </span>
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      {log.entityId.substring(0, 8)}...
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                    {log.metadata
                      ? JSON.stringify(log.metadata).substring(0, 100)
                      : "-"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t("common.showingEntries", {
            start: (page - 1) * PAGE_SIZE + 1,
            end: Math.min(page * PAGE_SIZE, totalCount),
            total: totalCount,
          })}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? (
              <Link href={buildPageUrl(page - 1)}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("common.previous")}
              </Link>
            ) : (
              <span>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("common.previous")}
              </span>
            )}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("common.page")} {page} {t("common.of")} {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            asChild={page < totalPages}
          >
            {page < totalPages ? (
              <Link href={buildPageUrl(page + 1)}>
                {t("common.next")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            ) : (
              <span>
                {t("common.next")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
