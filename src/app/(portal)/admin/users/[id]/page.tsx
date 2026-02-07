import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Shield,
  Users as UsersIcon,
  BookOpen,
  ArrowLeft,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getModuleProgress } from "@/lib/progress";
import { Progress } from "@/components/ui/progress";
import { UserEditForm } from "./user-edit-form";
import { UserPermissionsPanel } from "./user-permissions-panel";
import type { Permission } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { formatDuration } from "@/lib/utils";

const ALL_PERMISSIONS: Permission[] = [
  "MANAGE_ALL_MODULES",
  "MANAGE_OWN_MODULES",
  "VIEW_ALL_PROGRESS",
  "VIEW_GROUP_PROGRESS",
  "MANAGE_USERS",
  "MANAGE_GROUPS",
  "MANAGE_QUIZZES",
  "OVERRIDE_PROGRESS",
  "VIEW_ANALYTICS",
  "VIEW_AUDIT_LOG",
  "EXPORT_REPORTS",
];

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_USERS", { tenantId: ctx.tenantId });

  const { id } = await params;

  // Verify user has membership in this tenant
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: id, tenantId: ctx.tenantId } },
  });
  if (!membership) {
    notFound();
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      groups: {
        where: { group: { tenantId: ctx.tenantId } },
        include: {
          group: { select: { id: true, name: true, color: true } },
        },
      },
      permissions: {
        where: { tenantId: ctx.tenantId },
      },
    },
  });

  if (!user) {
    notFound();
  }

  // Get modules assigned via groups (scoped to tenant)
  const groupIds = user.groups.map((ug) => ug.groupId);
  const assignedModules = await prisma.moduleGroup.findMany({
    where: { groupId: { in: groupIds }, module: { tenantId: ctx.tenantId } },
    include: {
      module: {
        select: {
          id: true,
          title: true,
          status: true,
        },
      },
    },
    distinct: ["moduleId"],
  });

  // Get progress for each module
  const moduleProgressList = await Promise.all(
    assignedModules.map(async (mg) => {
      const progress = await getModuleProgress(user.id, mg.moduleId, ctx.tenantId);
      return {
        module: mg.module,
        progress,
      };
    })
  );

  // ── Usage stats ─────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [usageAllTime, usage30d, lastSeenRow] = await Promise.all([
    prisma.userSession.aggregate({
      where: { userId: id, tenantId: ctx.tenantId },
      _sum: { durationSeconds: true },
      _count: { id: true },
    }),
    prisma.userSession.aggregate({
      where: { userId: id, tenantId: ctx.tenantId, startedAt: { gte: thirtyDaysAgo } },
      _sum: { durationSeconds: true },
      _count: { id: true },
    }),
    prisma.userSession.findFirst({
      where: { userId: id, tenantId: ctx.tenantId },
      orderBy: { lastPingAt: "desc" },
      select: { lastPingAt: true },
    }),
  ]);

  const totalSecondsAll = usageAllTime._sum.durationSeconds ?? 0;
  const totalSessionsAll = usageAllTime._count.id;
  const seconds30d = usage30d._sum.durationSeconds ?? 0;
  const sessions30d = usage30d._count.id;
  const lastSeenAt = lastSeenRow?.lastPingAt ?? null;

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  const userPermissions = user.permissions.map((p) => p.permission);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-4">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">
              {user.firstName} {user.lastName}
            </h1>
            <p className="text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit User Form */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.users.userDetails")}</CardTitle>
          </CardHeader>
          <CardContent>
            <UserEditForm
              userId={user.id}
              defaultValues={{
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                role: user.role,
                isActive: user.isActive,
              }}
            />
          </CardContent>
        </Card>

        {/* Permissions */}
        <Card id="permissions">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {t("admin.users.permissions")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {user.role === "SUPER_ADMIN" ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.users.superAdminPermissions")}
              </p>
            ) : (
              <UserPermissionsPanel
                userId={user.id}
                allPermissions={ALL_PERMISSIONS}
                currentPermissions={userPermissions}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Groups */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4" />
            {t("admin.users.userGroups")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {user.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.users.noGroupsAssigned")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {user.groups.map((ug) => (
                <Link key={ug.groupId} href={`/admin/groups/${ug.groupId}`}>
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-muted"
                    style={
                      ug.group.color
                        ? {
                            borderColor: ug.group.color,
                            color: ug.group.color,
                          }
                        : undefined
                    }
                  >
                    {ug.group.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t("admin.users.usageCard")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalSessionsAll === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.users.noUsageData")}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">{t("admin.users.totalTime")}</h4>
                <p className="text-2xl font-bold">{formatDuration(totalSecondsAll)}</p>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">{t("admin.users.totalSessions")}</h4>
                <p className="text-2xl font-bold">{totalSessionsAll}</p>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t("admin.users.last30days")} — {t("admin.users.time")}
                </h4>
                <p className="text-lg font-semibold">{formatDuration(seconds30d)}</p>
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  {t("admin.users.last30days")} — {t("admin.users.sessions")}
                </h4>
                <p className="text-lg font-semibold">{sessions30d}</p>
              </div>
              {lastSeenAt && (
                <div className="sm:col-span-2 space-y-1">
                  <h4 className="text-sm font-medium text-muted-foreground">{t("admin.users.lastActivity")}</h4>
                  <p className="text-sm">
                    {format(new Date(lastSeenAt), "d. MMM yyyy, HH:mm", { locale: getDateLocale() })}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Module Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {t("admin.users.moduleProgress")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {moduleProgressList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.users.noModulesAssigned")}
            </p>
          ) : (
            <div className="space-y-4">
              {moduleProgressList.map(({ module, progress }) => (
                <div key={module.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium">
                        {module.title}
                      </span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {t(`progressStatus.${progress.status}`)}
                      </Badge>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {progress.percentage}%
                    </span>
                  </div>
                  <Progress value={progress.percentage} className="h-2" />
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {progress.completedSections}/{progress.totalSections}{" "}
                      {t("common.sections")}
                    </span>
                    {progress.hasOverride && (
                      <Badge variant="secondary" className="text-xs">
                        {t("admin.users.override")}
                      </Badge>
                    )}
                    {progress.certificateIssued && (
                      <Badge variant="default" className="text-xs">
                        {t("admin.users.certified")}
                      </Badge>
                    )}
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
