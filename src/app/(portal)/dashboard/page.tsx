import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import {
  BookOpen,
  Clock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Play,
  Award,
  Sparkles,
} from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getModuleProgress, type ModuleProgress } from "@/lib/progress";
import { sortModules } from "@/lib/module-sort";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ModuleCard, type ModuleCardProps } from "@/components/modules/module-card";
import { cn } from "@/lib/utils";


type ModuleWithProgress = {
  id: string;
  title: string;
  description: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  estimatedTime: number | null;
  coverImage: string | null;
  isMandatory: boolean;
  tags: string[];
  progress: ModuleProgress;
  deadline: Date | null;
  categoryName?: string | null;
  isUserPinned?: boolean;
  isCompanyPinned?: boolean;
};

export default async function DashboardPage() {
  const ctx = await getTenantContext();
  const user = ctx.user;

  const isSuperAdmin = ctx.effectiveRole === "SUPER_ADMIN" || ctx.effectiveRole === "OWNER";

  // Fetch user pins and company pins for sorting
  const [userPins, companyPins, userReviews] = await Promise.all([
    prisma.userPinnedModule.findMany({
      where: { userId: user.id },
      select: { moduleId: true },
    }),
    prisma.companyPinnedModule.findMany({
      where: { tenantId: ctx.tenantId },
      select: { moduleId: true },
    }),
    prisma.userModuleReview.findMany({
      where: { userId: user.id },
      select: { moduleId: true, lastSeenVersion: true },
    }),
  ]);
  const userPinSet = new Set(userPins.map((p) => p.moduleId));
  const companyPinSet = new Set(companyPins.map((p) => p.moduleId));
  const reviewMap = new Map(userReviews.map((r) => [r.moduleId, r.lastSeenVersion]));

  // Build module list depending on role
  let modulesWithProgress: ModuleWithProgress[];

  if (isSuperAdmin) {
    const allPublishedModules = await prisma.module.findMany({
      where: { status: "PUBLISHED", tenantId: ctx.tenantId },
      include: {
        tags: { include: { tag: true } },
        category: { select: { name: true } },
      },
    });

    modulesWithProgress = await Promise.all(
      allPublishedModules.map(async (module) => {
        const progress = await getModuleProgress(user.id, module.id, ctx.tenantId);
        return {
          id: module.id,
          title: module.title,
          description: module.description,
          difficulty: module.difficulty,
          estimatedTime: module.estimatedTime,
          coverImage: module.coverImage,
          isMandatory: module.isMandatory,
          tags: module.tags.map((t) => t.tag.name),
          progress,
          deadline: null,
          categoryName: module.category?.name ?? null,
          isUserPinned: userPinSet.has(module.id),
          isCompanyPinned: companyPinSet.has(module.id),
        };
      })
    );
  } else {
    const userGroups = await prisma.userGroup.findMany({
      where: { userId: user.id, group: { tenantId: ctx.tenantId } },
      select: { groupId: true, assignedAt: true },
    });

    const groupIds = userGroups.map((ug) => ug.groupId);
    const groupAssignedAtMap = new Map(userGroups.map((ug) => [ug.groupId, ug.assignedAt]));

    const moduleGroups = await prisma.moduleGroup.findMany({
      where: {
        groupId: { in: groupIds },
        module: { status: "PUBLISHED", tenantId: ctx.tenantId },
      },
      include: {
        module: {
          include: {
            tags: { include: { tag: true } },
            category: { select: { name: true } },
          },
        },
      },
    });

    const uniqueModules = new Map<
      string,
      {
        module: (typeof moduleGroups)[0]["module"];
        deadline: Date | null;
        isMandatory: boolean;
      }
    >();
    for (const mg of moduleGroups) {
      let computedDeadline: Date | null = null;
      if (mg.deadlineDays) {
        const assignedAt = groupAssignedAtMap.get(mg.groupId);
        if (assignedAt) {
          computedDeadline = new Date(assignedAt.getTime() + mg.deadlineDays * 24 * 60 * 60 * 1000);
        }
      }

      const existing = uniqueModules.get(mg.module.id);
      if (!existing) {
        uniqueModules.set(mg.module.id, {
          module: mg.module,
          deadline: computedDeadline,
          isMandatory: mg.isMandatory || mg.module.isMandatory,
        });
      } else {
        if (computedDeadline && (!existing.deadline || computedDeadline < existing.deadline)) {
          existing.deadline = computedDeadline;
        }
        if (mg.isMandatory) {
          existing.isMandatory = true;
        }
      }
    }

    modulesWithProgress = await Promise.all(
      Array.from(uniqueModules.values()).map(async ({ module, deadline, isMandatory }) => {
        const progress = await getModuleProgress(user.id, module.id, ctx.tenantId);
        return {
          id: module.id,
          title: module.title,
          description: module.description,
          difficulty: module.difficulty,
          estimatedTime: module.estimatedTime,
          coverImage: module.coverImage,
          isMandatory,
          tags: module.tags.map((t) => t.tag.name),
          progress,
          deadline,
          categoryName: module.category?.name ?? null,
          isUserPinned: userPinSet.has(module.id),
          isCompanyPinned: companyPinSet.has(module.id),
        };
      })
    );
  }

  // Sort using the recommended algorithm (pin-aware + smart ordering)
  modulesWithProgress = sortModules(modulesWithProgress, "recommended", companyPinSet, userPinSet);

  // Stats
  const totalModules = modulesWithProgress.length;
  const completedModules = modulesWithProgress.filter(
    (m) => m.progress.status === "COMPLETED"
  ).length;
  const inProgressModules = modulesWithProgress.filter(
    (m) => m.progress.status === "IN_PROGRESS" || m.progress.status === "READY_FOR_QUIZ"
  ).length;

  // Hero CTA: first in-progress → first quiz-ready → first not-started (prefer mandatory + nearest deadline)
  const heroModule =
    modulesWithProgress.find((m) => m.progress.status === "IN_PROGRESS") ??
    modulesWithProgress.find((m) => m.progress.status === "READY_FOR_QUIZ") ??
    [...modulesWithProgress]
      .filter((m) => m.progress.status === "NOT_STARTED")
      .sort((a, b) => {
        if (a.isMandatory !== b.isMandatory) return a.isMandatory ? -1 : 1;
        if (a.deadline && b.deadline) return a.deadline.getTime() - b.deadline.getTime();
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return 0;
      })[0] ??
    null;

  const allDone = totalModules > 0 && completedModules === totalModules;

  // Upcoming deadlines (next 30 days, not completed)
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = modulesWithProgress
    .filter(
      (m) =>
        m.deadline &&
        m.deadline > now &&
        m.deadline <= thirtyDaysFromNow &&
        m.progress.status !== "COMPLETED"
    )
    .sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime());

  // Overall progress percentage
  const overallPct = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;

  // Map modules to ModuleCardProps
  const moduleCards: ModuleCardProps[] = modulesWithProgress.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    difficulty: m.difficulty,
    estimatedTime: m.estimatedTime,
    coverImage: m.coverImage,
    isMandatory: m.isMandatory,
    tags: m.tags,
    progress: {
      percentage: m.progress.percentage,
      status: m.progress.status,
      completedSections: m.progress.completedSections,
      totalSections: m.progress.totalSections,
    },
    deadline: m.deadline,
    needsReview: m.progress.status !== "COMPLETED" && (reviewMap.get(m.id) ?? 0) < 1,
    isUserPinned: m.isUserPinned,
    isCompanyPinned: m.isCompanyPinned,
    categoryName: m.categoryName,
  }));

  return (
    <div className="space-y-8">
      {/* ─── Greeting ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("dashboard.welcome", { name: user.firstName })}
        </h1>
        <p className="text-muted-foreground mt-0.5">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* ─── Hero CTA ─── */}
      {totalModules > 0 && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground">
          {/* Decorative background shapes */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/5" />
            <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />
            <div className="absolute top-1/2 right-1/4 h-20 w-20 rounded-full bg-white/3" />
          </div>

          <div className="relative px-6 py-6 sm:px-8 sm:py-8">
            {allDone ? (
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-lg font-semibold">{t("dashboard.allCompleted")}</p>
                  <p className="text-sm opacity-80 mt-0.5">
                    {t("dashboard.progressSummary", { completed: String(completedModules), total: String(totalModules) })}
                  </p>
                </div>
              </div>
            ) : heroModule ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
                    <Play className="h-7 w-7" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium opacity-80">
                      {heroModule.progress.status === "NOT_STARTED"
                        ? t("dashboard.startNextModule")
                        : t("dashboard.continueLearning")}
                    </p>
                    <p className="text-lg font-semibold truncate mt-0.5">{heroModule.title}</p>
                    {heroModule.progress.status !== "NOT_STARTED" && (
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 max-w-[180px]">
                          <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-white/90 transition-all"
                              style={{ width: `${heroModule.progress.percentage}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-xs opacity-80">
                          {heroModule.progress.percentage}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  asChild
                  size="lg"
                  className="shrink-0 bg-white text-primary hover:bg-white/90 font-semibold shadow-lg shadow-black/10"
                >
                  <Link href={`/modules/${heroModule.id}`}>
                    {heroModule.progress.status === "NOT_STARTED"
                      ? t("dashboard.startModule")
                      : heroModule.progress.status === "READY_FOR_QUIZ"
                        ? t("modules.ctaQuiz")
                        : t("dashboard.continueModule")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ─── Stats row — clean, minimal ─── */}
      {totalModules > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Progress card */}
          <div className="sm:col-span-2 rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-foreground">
                {t("dashboard.progressSummary", { completed: String(completedModules), total: String(totalModules) })}
              </span>
              <span className="text-sm font-semibold text-primary">{overallPct}%</span>
            </div>
            <Progress value={overallPct} className="h-2" />
            <div className="flex gap-5 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary" />
                {completedModules} {t("dashboard.completed").toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary/40" />
                {inProgressModules} {t("dashboard.inProgress").toLowerCase()}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                {totalModules - completedModules - inProgressModules} {t("progressStatus.NOT_STARTED").toLowerCase()}
              </span>
            </div>
          </div>

          {/* Certificates card */}
          <Link href="/certificates" className="block group">
            <div className="h-full rounded-xl border border-border/40 bg-card p-5 transition-all hover:shadow-md hover:border-primary/20 flex flex-col justify-center">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Award className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{completedModules}</p>
                  <p className="text-xs text-muted-foreground">{t("certificates.title")}</p>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ─── Upcoming deadlines ─── */}
      {upcomingDeadlines.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t("dashboard.upcomingDeadlines")}
          </h2>
          <div className="space-y-2">
            {upcomingDeadlines.map((m) => (
              <Link key={m.id} href={`/modules/${m.id}`} className="block group">
                <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card px-4 py-3 transition-all hover:shadow-sm hover:border-primary/20">
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.due", {
                        time: formatDistanceToNow(m.deadline!, { addSuffix: true, locale: getDateLocale() }),
                        date: format(m.deadline!, "d. MMM yyyy", { locale: getDateLocale() }),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs font-medium text-muted-foreground">{m.progress.percentage}%</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ─── Module grid ─── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold">{t("dashboard.yourModules")}</h2>
          <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground hover:text-foreground">
            <Link href="/modules">
              {t("common.viewAll")}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {moduleCards.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card">
            <div className="py-16 text-center text-muted-foreground">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
                <BookOpen className="h-7 w-7 opacity-40" />
              </div>
              <p className="font-medium">{t("dashboard.noModulesAssigned")}</p>
              <p className="text-sm mt-1 opacity-70">
                {t("dashboard.contactAdmin")}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map((m) => (
              <ModuleCard key={m.id} module={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
