import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { getPlanLimits } from "@/lib/plan";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  BookOpen,
  BarChart3,
  Clock,
  ArrowRight,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { t } from "@/lib/i18n";

export default async function AdminDashboardPage() {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ANALYTICS", { tenantId: ctx.tenantId });

  const [
    totalUsers,
    activeUsers,
    totalModules,
    publishedModules,
    totalCompletions,
    totalSections,
    pendingDeadlines,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.membership.count({ where: { tenantId: ctx.tenantId, user: { deletedAt: null } } }),
    prisma.membership.count({ where: { tenantId: ctx.tenantId, user: { isActive: true, deletedAt: null } } }),
    prisma.module.count({ where: { tenantId: ctx.tenantId } }),
    prisma.module.count({ where: { status: "PUBLISHED", tenantId: ctx.tenantId } }),
    prisma.sectionCompletion.count({ where: { section: { module: { tenantId: ctx.tenantId } } } }),
    prisma.section.count({ where: { module: { tenantId: ctx.tenantId } } }),
    prisma.moduleGroup.count({
      where: {
        deadlineDays: { not: null },
        module: { tenantId: ctx.tenantId },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        action: { notIn: ["OWNER_IMPERSONATION", "TENANT_DELETED"] },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        actor: {
          select: { firstName: true, lastName: true },
        },
      },
    }),
  ]);

  // Completion rate = total completions / (sections × users who have access)
  // This gives the average % of sections completed across all users
  const completionRate =
    totalSections > 0 && activeUsers > 0
      ? Math.round((totalCompletions / (totalSections * activeUsers)) * 100)
      : 0;

  const limits = getPlanLimits(ctx.tenantPlan);
  const planBadgeMap = { FREE: "secondary", STARTER: "outline", PRO: "default" } as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{t("admin.dashboard.title")}</h1>
            <Badge variant={planBadgeMap[ctx.tenantPlan]} className="text-xs">
              {t(`plan.${ctx.tenantPlan.toLowerCase()}Badge`)}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {t("admin.dashboard.subtitle")}
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.dashboard.totalUsers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              {limits.maxUsers !== null
                ? t("plan.usage", { used: String(totalUsers), max: String(limits.maxUsers) })
                : t("admin.dashboard.active", { count: activeUsers })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.dashboard.activeModules")}
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {publishedModules} / {totalModules}
            </div>
            <p className="text-xs text-muted-foreground">
              {limits.maxModules !== null
                ? t("admin.dashboard.publishedOfLimit", { published: String(publishedModules), total: String(totalModules), max: String(limits.maxModules) })
                : t("admin.dashboard.publishedOfTotal", { published: String(publishedModules), total: String(totalModules) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.dashboard.completionRate")}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.dashboard.completionDetail", { completed: String(totalCompletions), total: String(totalSections * activeUsers) })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.dashboard.pendingDeadlines")}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingDeadlines}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.dashboard.upcomingDeadlines", { count: pendingDeadlines })}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {t("admin.dashboard.recentActivity")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAuditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("admin.dashboard.noRecentActivity")}
                </p>
              ) : (
                recentAuditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between gap-2 border-b pb-3 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {t(`auditActions.${log.action}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.actor
                          ? `${log.actor.firstName} ${log.actor.lastName}`
                          : t("common.system")}{" "}
                        &middot; {log.entityType}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {format(new Date(log.createdAt), "d. MMM, HH:mm", { locale: getDateLocale() })}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.dashboard.quickActions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/admin/users">
                  {t("admin.dashboard.manageUsers")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/admin/modules">
                  {t("admin.dashboard.manageModules")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/admin/groups">
                  {t("admin.dashboard.manageGroups")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/admin/progress">
                  {t("admin.dashboard.viewProgress")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="w-full justify-between" asChild>
                <Link href="/admin/audit-log">
                  {t("admin.dashboard.viewAuditLog")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
