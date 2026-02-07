import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { getBatchedProgressForTenant } from "@/lib/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { getDateLocale } from "@/lib/i18n/date-locale";
import { ProgressFilters } from "./progress-filters";
import { t } from "@/lib/i18n";
import {
  BarChart3,
  Users,
  Activity,
  AlertTriangle,
} from "lucide-react";

const statusColors: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  READY_FOR_QUIZ: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
};

export default async function AdminProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; module?: string; status?: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ALL_PROGRESS", { tenantId: ctx.tenantId });

  const params = await searchParams;
  const filterGroupId = params.group || "";
  const filterModuleId = params.module || "";
  const filterStatus = params.status || "";

  // Fetch filter options + batched progress in parallel
  const [allGroups, allModules, batchResult] = await Promise.all([
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
    getBatchedProgressForTenant(
      ctx.tenantId,
      filterGroupId || undefined,
      filterModuleId || undefined,
    ),
  ]);

  const { entries, userMap, moduleMap, groupModuleMap, groupNameMap } = batchResult;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // ── KPI computations ──────────────────────────────────────────────

  const avgProgress =
    entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + e.percentage, 0) / entries.length)
      : 0;

  const activeUserIds7d = new Set<string>();
  for (const e of entries) {
    if (e.lastAccessedAt && new Date(e.lastAccessedAt) >= sevenDaysAgo) {
      activeUserIds7d.add(e.userId);
    }
  }

  const inProgressCount = entries.filter((e) => e.status === "IN_PROGRESS").length;

  const inactive7dCount = entries.filter(
    (e) =>
      e.status !== "COMPLETED" &&
      (!e.lastAccessedAt || new Date(e.lastAccessedAt) < sevenDaysAgo),
  ).length;

  // ── Group aggregation ─────────────────────────────────────────────

  type GroupStats = {
    groupId: string;
    name: string;
    userCount: number;
    avgProgress: number;
    completedPct: number;
    inactive7dPct: number;
  };

  const groupStatsArr: GroupStats[] = [];

  for (const [groupId, moduleIds] of groupModuleMap) {
    const name = groupNameMap.get(groupId) ?? groupId;

    // Entries belonging to this group: user is in group AND module is assigned to group
    const groupEntries = entries.filter((e) => {
      const user = userMap.get(e.userId);
      return user?.groupIds.includes(groupId) && moduleIds.has(e.moduleId);
    });

    if (groupEntries.length === 0) continue;

    const uniqueUsers = new Set(groupEntries.map((e) => e.userId));
    const avg = Math.round(
      groupEntries.reduce((s, e) => s + e.percentage, 0) / groupEntries.length,
    );
    const completed = groupEntries.filter((e) => e.status === "COMPLETED").length;
    const inactive = groupEntries.filter(
      (e) =>
        e.status !== "COMPLETED" &&
        (!e.lastAccessedAt || new Date(e.lastAccessedAt) < sevenDaysAgo),
    ).length;

    groupStatsArr.push({
      groupId,
      name,
      userCount: uniqueUsers.size,
      avgProgress: avg,
      completedPct: Math.round((completed / groupEntries.length) * 100),
      inactive7dPct: Math.round((inactive / groupEntries.length) * 100),
    });
  }

  // Sort by lowest avg progress (problematic groups first)
  groupStatsArr.sort((a, b) => a.avgProgress - b.avgProgress);

  // ── Module aggregation ────────────────────────────────────────────

  type ModuleStats = {
    moduleId: string;
    title: string;
    assignedUsers: number;
    avgProgress: number;
    completedPct: number;
    inProgressPct: number;
    inactive7dPct: number;
  };

  const moduleStatsArr: ModuleStats[] = [];

  const moduleIds = new Set(entries.map((e) => e.moduleId));
  for (const moduleId of moduleIds) {
    const title = moduleMap.get(moduleId)?.title ?? moduleId;
    const modEntries = entries.filter((e) => e.moduleId === moduleId);
    if (modEntries.length === 0) continue;

    const uniqueUsers = new Set(modEntries.map((e) => e.userId));
    const avg = Math.round(
      modEntries.reduce((s, e) => s + e.percentage, 0) / modEntries.length,
    );
    const completed = modEntries.filter((e) => e.status === "COMPLETED").length;
    const inProg = modEntries.filter((e) => e.status === "IN_PROGRESS").length;
    const inactive = modEntries.filter(
      (e) =>
        e.status !== "COMPLETED" &&
        (!e.lastAccessedAt || new Date(e.lastAccessedAt) < sevenDaysAgo),
    ).length;

    moduleStatsArr.push({
      moduleId,
      title,
      assignedUsers: uniqueUsers.size,
      avgProgress: avg,
      completedPct: Math.round((completed / modEntries.length) * 100),
      inProgressPct: Math.round((inProg / modEntries.length) * 100),
      inactive7dPct: Math.round((inactive / modEntries.length) * 100),
    });
  }

  // Sort by lowest avg progress (stuck knowledge first)
  moduleStatsArr.sort((a, b) => a.avgProgress - b.avgProgress);

  // ── Individual users — apply status filter ────────────────────────

  let filteredEntries = entries;

  if (filterStatus === "inactive7d") {
    filteredEntries = entries.filter(
      (e) =>
        e.status !== "COMPLETED" &&
        (!e.lastAccessedAt || new Date(e.lastAccessedAt) < sevenDaysAgo),
    );
  } else if (filterStatus === "in_progress") {
    filteredEntries = entries.filter((e) => e.status === "IN_PROGRESS");
  } else if (filterStatus === "completed") {
    filteredEntries = entries.filter((e) => e.status === "COMPLETED");
  }

  // Sort by user name
  filteredEntries.sort((a, b) => {
    const ua = userMap.get(a.userId);
    const ub = userMap.get(b.userId);
    const na = `${ua?.firstName ?? ""} ${ua?.lastName ?? ""}`;
    const nb = `${ub?.firstName ?? ""} ${ub?.lastName ?? ""}`;
    return na.localeCompare(nb);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("admin.progress.title")}</h1>
        <p className="text-muted-foreground">{t("admin.progress.subtitle")}</p>
      </div>

      {/* Filters */}
      <ProgressFilters
        groups={allGroups}
        modules={allModules}
        selectedGroup={filterGroupId}
        selectedModule={filterModuleId}
        selectedStatus={filterStatus}
      />

      {/* ── Section 1: KPI Cards ──────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.progress.kpiAvgProgress")}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgProgress}%</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.progress.kpiAvgProgressDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.progress.kpiActiveUsers7d")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUserIds7d.size}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.progress.kpiActiveUsers7dDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.progress.kpiInProgress")}
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.progress.kpiInProgressDesc")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.progress.kpiInactive7d")}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inactive7dCount}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.progress.kpiInactive7dDesc")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Section 2: Group Overview ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.progress.groupOverview")}</CardTitle>
          <CardDescription>{t("admin.progress.groupOverviewDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.progress.tableGroupName")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableUserCount")}</TableHead>
                  <TableHead>{t("admin.progress.tableAvgProgress")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableCompleted")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableInactive7d")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupStatsArr.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t("admin.progress.noGroupData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  groupStatsArr.map((g) => (
                    <TableRow key={g.groupId}>
                      <TableCell className="font-medium">{g.name}</TableCell>
                      <TableCell className="text-right">{g.userCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress value={g.avgProgress} className="h-2 w-24" />
                          <span className="text-sm text-muted-foreground">
                            {g.avgProgress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{g.completedPct}%</TableCell>
                      <TableCell className="text-right">{g.inactive7dPct}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 3: Module Overview ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.progress.moduleOverview")}</CardTitle>
          <CardDescription>{t("admin.progress.moduleOverviewDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.progress.tableModule")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableAssignedUsers")}</TableHead>
                  <TableHead>{t("admin.progress.tableAvgProgress")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableCompleted")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableInProgress")}</TableHead>
                  <TableHead className="text-right">{t("admin.progress.tableInactive7d")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moduleStatsArr.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t("admin.progress.noModuleData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  moduleStatsArr.map((m) => (
                    <TableRow key={m.moduleId}>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell className="text-right">{m.assignedUsers}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Progress value={m.avgProgress} className="h-2 w-24" />
                          <span className="text-sm text-muted-foreground">
                            {m.avgProgress}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{m.completedPct}%</TableCell>
                      <TableCell className="text-right">{m.inProgressPct}%</TableCell>
                      <TableCell className="text-right">{m.inactive7dPct}%</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Section 4: Individual Users ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.progress.individualUsers")}</CardTitle>
          <CardDescription>{t("admin.progress.individualUsersDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
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
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t("admin.progress.noProgressData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((row) => {
                    const user = userMap.get(row.userId);
                    const userName = user
                      ? `${user.firstName} ${user.lastName}`
                      : row.userId;
                    const userEmail = user?.email ?? "";
                    const moduleTitle =
                      moduleMap.get(row.moduleId)?.title ?? row.moduleId;
                    const initials = userName
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
                              <p className="font-medium">{userName}</p>
                              <p className="text-xs text-muted-foreground">
                                {userEmail}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {moduleTitle}
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
                                "d. MMM, HH:mm",
                                { locale: getDateLocale() },
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
        </CardContent>
      </Card>
    </div>
  );
}
