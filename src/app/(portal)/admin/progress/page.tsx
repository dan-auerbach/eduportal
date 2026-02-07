import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { getModuleProgress } from "@/lib/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { format } from "date-fns";
import { ProgressFilters } from "./progress-filters";
import { t } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  READY_FOR_QUIZ: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
};

export default async function AdminProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; module?: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ALL_PROGRESS", { tenantId: ctx.tenantId });

  const params = await searchParams;
  const filterGroupId = params.group || "";
  const filterModuleId = params.module || "";

  // Get all groups and modules for filters (scoped to tenant)
  const [allGroups, allModules] = await Promise.all([
    prisma.group.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.module.findMany({
      where: { status: "PUBLISHED", tenantId: ctx.tenantId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ]);

  // Build user query based on filters (scoped to tenant via memberships)
  const userWhere: Record<string, unknown> = {
    deletedAt: null,
    isActive: true,
    memberships: { some: { tenantId: ctx.tenantId } },
  };

  if (filterGroupId) {
    userWhere.groups = {
      some: { groupId: filterGroupId },
    };
  }

  const users = await prisma.user.findMany({
    where: userWhere,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      groups: {
        include: {
          group: { select: { id: true } },
        },
      },
    },
    orderBy: { firstName: "asc" },
    take: 100,
  });

  // Get module assignments for each user
  type ProgressRow = {
    userId: string;
    userName: string;
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    percentage: number;
    status: string;
    lastAccessedAt: Date | null;
  };

  const progressRows: ProgressRow[] = [];

  for (const user of users) {
    const groupIds = user.groups.map((ug) => ug.groupId);

    const moduleAssignments = await prisma.moduleGroup.findMany({
      where: {
        groupId: { in: groupIds },
        module: {
          status: "PUBLISHED",
          tenantId: ctx.tenantId,
          ...(filterModuleId ? { id: filterModuleId } : {}),
        },
      },
      include: {
        module: { select: { id: true, title: true } },
      },
      distinct: ["moduleId"],
    });

    for (const assignment of moduleAssignments) {
      const progress = await getModuleProgress(
        user.id,
        assignment.moduleId,
        ctx.tenantId
      );
      progressRows.push({
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        moduleId: assignment.moduleId,
        moduleTitle: assignment.module.title,
        percentage: progress.percentage,
        status: progress.status,
        lastAccessedAt: progress.lastAccessedAt,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("admin.progress.title")}</h1>
        <p className="text-muted-foreground">
          {t("admin.progress.subtitle")}
        </p>
      </div>

      <ProgressFilters
        groups={allGroups}
        modules={allModules}
        selectedGroup={filterGroupId}
        selectedModule={filterModuleId}
      />

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.progress.tableUser")}</TableHead>
              <TableHead>{t("admin.progress.tableModule")}</TableHead>
              <TableHead>{t("admin.progress.tableProgress")}</TableHead>
              <TableHead>{t("admin.progress.tableStatus")}</TableHead>
              <TableHead>{t("admin.progress.tableLastActivity")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {progressRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  {t("admin.progress.noProgressData")}
                </TableCell>
              </TableRow>
            ) : (
              progressRows.map((row) => {
                const initials = row.userName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase();
                return (
                  <TableRow key={`${row.userId}-${row.moduleId}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{row.userName}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.userEmail}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {row.moduleTitle}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Progress
                          value={row.percentage}
                          className="h-2 w-24"
                        />
                        <span className="text-sm text-muted-foreground">
                          {row.percentage}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusColors[row.status]}
                      >
                        {t(`progressStatus.${row.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lastAccessedAt
                        ? format(
                            new Date(row.lastAccessedAt),
                            "MMM d, yyyy HH:mm"
                          )
                        : t("common.never")}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/progress/${row.userId}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {t("common.details")}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
