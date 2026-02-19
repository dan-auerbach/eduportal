import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { getManagerDashboardData } from "@/actions/manager-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RankBadge } from "@/components/gamification/rank-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Zap,
  CheckCircle2,
  Lightbulb,
  Users,
  Trophy,
} from "lucide-react";
import { ManagerFilters } from "./filters";
import { CompletionHeatmap } from "./heatmap";

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const ctx = await getTenantContext();
  const params = await searchParams;
  const groupId = params.group || undefined;

  const [dashResult, groups] = await Promise.all([
    getManagerDashboardData(groupId),
    prisma.group.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!dashResult.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("manager.title")}</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>{dashResult.error ?? t("common.error")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = dashResult.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("manager.title")}</h1>
        <p className="text-muted-foreground">{t("manager.subtitle")}</p>
      </div>

      <ManagerFilters groups={groups} currentGroup={groupId ?? ""} />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("manager.usersAtRisk")}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.kpi.usersAtRisk}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("manager.avgEngagement")}
            </CardTitle>
            <Zap className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.kpi.avgEngagementXp} XP</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("manager.completionRate")}
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.kpi.overallCompletionRate}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("manager.activeSuggestions")}
            </CardTitle>
            <Lightbulb className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.kpi.activeSuggestions}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Risk Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t("manager.riskUsers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.riskUsers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("manager.noRiskUsers")}
              </p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {data.riskUsers.slice(0, 20).map((user, i) => (
                  <div
                    key={`${user.userId}-${user.moduleId}-${i}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{user.userName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.moduleTitle} &middot; {user.groupName}
                      </p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {user.daysOverdue}d {t("manager.overdue")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-5 w-5 text-yellow-500" />
              {t("manager.topPerformers")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topPerformers.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                {t("manager.noPerformers")}
              </p>
            ) : (
              <div className="space-y-2">
                {data.topPerformers.map((user, i) => {
                  const initials = `${user.userName.split(" ").map((w) => w[0] ?? "").join("")}`.toUpperCase().slice(0, 2);
                  return (
                    <div
                      key={user.userId}
                      className="flex items-center gap-3 rounded-md border px-3 py-2"
                    >
                      <span className="w-5 text-center text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{user.userName}</p>
                        <RankBadge rank={user.rank} size="sm" />
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums flex items-center gap-0.5">
                          <Zap className="h-3 w-3 text-yellow-500" />
                          {user.totalXp.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          +{user.xpThisMonth} {t("manager.thisMonth")}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Completion Heatmap */}
      {data.heatmap.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("manager.completionHeatmap")}</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionHeatmap cells={data.heatmap} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
