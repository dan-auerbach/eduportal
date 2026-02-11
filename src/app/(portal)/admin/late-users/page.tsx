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
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { t } from "@/lib/i18n";
import { LateUserFilters } from "./late-user-filters";
import { LateUserActions } from "./late-user-actions";

type LateReason = "NOT_STARTED" | "IN_PROGRESS" | "MISSING_QUIZ" | "INACTIVE";

const reasonColors: Record<LateReason, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  MISSING_QUIZ: "bg-amber-100 text-amber-800",
  INACTIVE: "bg-red-100 text-red-800",
};

export default async function AdminLateUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; module?: string; reason?: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ALL_PROGRESS", { tenantId: ctx.tenantId });

  const params = await searchParams;
  const filterGroupId = params.group || "";
  const filterModuleId = params.module || "";
  const filterReason = params.reason || "";

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

  // Get all module-group assignments with deadlines (scoped to tenant)
  const moduleGroups = await prisma.moduleGroup.findMany({
    where: {
      deadlineDays: { not: null },
      ...(filterGroupId ? { groupId: filterGroupId } : {}),
      ...(filterModuleId ? { moduleId: filterModuleId } : {}),
      module: { status: "PUBLISHED", tenantId: ctx.tenantId },
    },
    include: {
      module: { select: { id: true, title: true } },
      group: {
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  isActive: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Build late users list
  type LateUser = {
    userId: string;
    userName: string;
    userEmail: string;
    moduleId: string;
    moduleTitle: string;
    deadline: Date;
    daysOverdue: number;
    progress: number;
    reason: LateReason;
    lastActivity: Date | null;
  };

  const lateUsers: LateUser[] = [];
  const now = new Date();

  for (const mg of moduleGroups) {
    if (!mg.deadlineDays) continue;

    for (const ug of mg.group.users) {
      if (!ug.user.isActive) continue;

      const userDeadline = new Date(
        ug.assignedAt.getTime() + mg.deadlineDays! * 24 * 60 * 60 * 1000
      );

      // Only include if deadline has passed
      if (userDeadline >= now) continue;

      const progress = await getModuleProgress(ug.userId, mg.moduleId, ctx.tenantId);

      // Skip completed modules
      if (progress.status === "COMPLETED") continue;

      const daysOverdue = Math.floor(
        (now.getTime() - userDeadline.getTime()) / (24 * 60 * 60 * 1000)
      );

      // Determine reason
      let reason: LateReason;
      if (progress.percentage === 0) {
        reason = "NOT_STARTED";
      } else if (
        progress.completedSections >= progress.totalSections &&
        progress.hasQuizzes &&
        !progress.allQuizzesPassed
      ) {
        reason = "MISSING_QUIZ";
      } else if (
        progress.lastAccessedAt &&
        now.getTime() - progress.lastAccessedAt.getTime() > 7 * 24 * 60 * 60 * 1000
      ) {
        reason = "INACTIVE";
      } else {
        reason = "IN_PROGRESS";
      }

      // Apply reason filter
      if (filterReason && reason !== filterReason) continue;

      lateUsers.push({
        userId: ug.userId,
        userName: `${ug.user.firstName} ${ug.user.lastName}`,
        userEmail: ug.user.email,
        moduleId: mg.moduleId,
        moduleTitle: mg.module.title,
        deadline: userDeadline,
        daysOverdue,
        progress: progress.percentage,
        reason,
        lastActivity: progress.lastAccessedAt,
      });
    }
  }

  // Sort by days overdue descending
  lateUsers.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("admin.lateUsers.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("admin.lateUsers.subtitle")}
        </p>
      </div>

      <LateUserFilters
        allGroups={allGroups}
        allModules={allModules}
        currentGroup={filterGroupId}
        currentModule={filterModuleId}
        currentReason={filterReason}
      />

      {lateUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">{t("admin.lateUsers.noLateUsers")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin.lateUsers.user")}</TableHead>
                <TableHead>{t("admin.lateUsers.module")}</TableHead>
                <TableHead>{t("admin.lateUsers.deadline")}</TableHead>
                <TableHead>{t("admin.lateUsers.daysOverdue")}</TableHead>
                <TableHead>{t("admin.lateUsers.progress")}</TableHead>
                <TableHead>{t("admin.lateUsers.reason")}</TableHead>
                <TableHead>{t("admin.lateUsers.lastActivity")}</TableHead>
                <TableHead className="w-[120px]">{t("admin.lateUsers.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lateUsers.map((lu, idx) => (
                <TableRow key={`${lu.userId}-${lu.moduleId}-${idx}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-xs">
                          {lu.userName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{lu.userName}</p>
                        <p className="text-xs text-muted-foreground">
                          {lu.userEmail}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{lu.moduleTitle}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(lu.deadline, "d. MMM yyyy", { locale: getDateLocale() })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="destructive" className="text-xs">
                      {t("admin.lateUsers.daysLate", { days: lu.daysOverdue })}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={lu.progress} className="h-2 w-16" />
                      <span className="text-xs text-muted-foreground">
                        {lu.progress}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={reasonColors[lu.reason]}
                    >
                      {t(`admin.lateUsers.reasons.${lu.reason}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lu.lastActivity
                      ? format(lu.lastActivity, "d. MMM yyyy", {
                          locale: getDateLocale(),
                        })
                      : t("common.never")}
                  </TableCell>
                  <TableCell>
                    <LateUserActions
                      userId={lu.userId}
                      moduleId={lu.moduleId}
                      moduleTitle={lu.moduleTitle}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
