import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { getModuleProgress } from "@/lib/progress";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, BookOpen, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { OverrideProgressDialog } from "./override-dialog";
import { t } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  READY_FOR_QUIZ: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
};

export default async function AdminUserProgressPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ALL_PROGRESS", { tenantId: ctx.tenantId });

  const { userId } = await params;

  // Verify user has membership in this tenant
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId: ctx.tenantId } },
  });
  if (!membership) {
    notFound();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
      groups: {
        where: { group: { tenantId: ctx.tenantId } },
        select: { groupId: true, assignedAt: true },
      },
    },
  });

  if (!user) {
    notFound();
  }

  const groupIds = user.groups.map((ug) => ug.groupId);
  const groupAssignedAtMap = new Map(user.groups.map((ug) => [ug.groupId, ug.assignedAt]));

  // Get all modules assigned through groups (scoped to tenant)
  const moduleAssignments = await prisma.moduleGroup.findMany({
    where: {
      groupId: { in: groupIds },
      module: { status: "PUBLISHED", tenantId: ctx.tenantId },
    },
    include: {
      module: {
        include: {
          sections: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, type: true },
          },
          quizzes: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, passingScore: true, maxAttempts: true },
          },
        },
      },
    },
    distinct: ["moduleId"],
  });

  // Get progress and completion data for each module
  const moduleData = await Promise.all(
    moduleAssignments.map(async (ma) => {
      const progress = await getModuleProgress(userId, ma.moduleId, ctx.tenantId);

      // Calculate per-user deadline from assignedAt + deadlineDays
      let computedDeadline: Date | null = null;
      if (ma.deadlineDays) {
        const assignedAt = groupAssignedAtMap.get(ma.groupId);
        if (assignedAt) {
          computedDeadline = new Date(assignedAt.getTime() + ma.deadlineDays * 24 * 60 * 60 * 1000);
        }
      }

      // Get section completions
      const completions = await prisma.sectionCompletion.findMany({
        where: { userId, section: { moduleId: ma.moduleId } },
        select: { sectionId: true, completedAt: true },
      });

      const completionMap = new Map(
        completions.map((c) => [c.sectionId, c.completedAt])
      );

      // Get quiz attempts
      const quizAttempts = await prisma.quizAttempt.findMany({
        where: {
          userId,
          quiz: { moduleId: ma.moduleId },
        },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          quizId: true,
          score: true,
          passed: true,
          startedAt: true,
          completedAt: true,
          quiz: { select: { title: true } },
        },
      });

      return {
        module: ma.module,
        deadline: computedDeadline,
        progress,
        completionMap,
        quizAttempts,
      };
    })
  );

  const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/progress">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">
            {user.firstName} {user.lastName}
          </h1>
          <p className="text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {moduleData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">{t("admin.progress.noModulesAssigned")}</p>
            <p className="text-sm text-muted-foreground">
              {t("admin.progress.noModulesAssignedDesc")}
            </p>
          </CardContent>
        </Card>
      ) : (
        moduleData.map(
          ({ module, deadline, progress, completionMap, quizAttempts }) => (
            <Card key={module.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      {module.title}
                      <Badge
                        variant="outline"
                        className={statusColors[progress.status]}
                      >
                        {t(`progressStatus.${progress.status}`)}
                      </Badge>
                      {progress.certificateIssued && (
                        <Badge variant="default">{t("admin.users.certified")}</Badge>
                      )}
                      {progress.hasOverride && (
                        <Badge variant="secondary">{t("admin.users.override")}</Badge>
                      )}
                    </CardTitle>
                    {deadline && (
                      <p className="text-sm text-muted-foreground">
                        {t("admin.editor.deadlineLabel")}:{" "}
                        {format(deadline, "d. MMM yyyy")}
                      </p>
                    )}
                  </div>
                  <OverrideProgressDialog
                    userId={userId}
                    moduleId={module.id}
                    moduleName={module.title}
                    hasExistingOverride={progress.hasOverride}
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Progress value={progress.percentage} className="h-3 flex-1" />
                  <span className="text-sm font-medium">
                    {progress.percentage}%
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {progress.completedSections}/{progress.totalSections} {t("admin.progress.sectionsLabel")}
                  {" "}{t("common.complete")}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Section completion details */}
                <div>
                  <h4 className="mb-2 text-sm font-semibold">{t("admin.progress.sectionsLabel")}</h4>
                  <div className="space-y-1">
                    {module.sections.map((section) => {
                      const completedAt = completionMap.get(section.id);
                      return (
                        <div
                          key={section.id}
                          className="flex items-center justify-between rounded-md border px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            {completedAt ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            )}
                            <span className="text-sm">{section.title}</span>
                            <Badge variant="outline" className="text-xs">
                              {t(`sectionType.${section.type}`)}
                            </Badge>
                          </div>
                          {completedAt && (
                            <span className="text-xs text-muted-foreground">
                              {format(
                                new Date(completedAt),
                                "MMM d, yyyy HH:mm"
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quiz attempts */}
                {quizAttempts.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">
                      {t("admin.progress.quizAttempts")}
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("admin.progress.quiz")}</TableHead>
                          <TableHead>{t("admin.progress.score")}</TableHead>
                          <TableHead>{t("admin.progress.passed")}</TableHead>
                          <TableHead>{t("admin.progress.date")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {quizAttempts.map((attempt) => (
                          <TableRow key={attempt.id}>
                            <TableCell className="font-medium">
                              {attempt.quiz.title}
                            </TableCell>
                            <TableCell>{Math.round(attempt.score)}%</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  attempt.passed ? "default" : "destructive"
                                }
                              >
                                {attempt.passed ? t("admin.progress.passed") : t("admin.progress.failed")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {format(
                                new Date(attempt.startedAt),
                                "MMM d, yyyy HH:mm"
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        )
      )}
    </div>
  );
}
