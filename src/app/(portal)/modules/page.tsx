import { BookOpen, CheckCircle2 } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { getBatchedProgressForUser } from "@/lib/progress";
import { ModuleCard, type ModuleCardProps } from "@/components/modules/module-card";
import { CompletedModuleCard } from "@/components/modules/completed-module-card";
import { CompletedSection } from "@/components/modules/completed-section";
import { ModuleFilters } from "@/components/modules/module-filters";
import { CategoryTabBar } from "@/components/modules/category-tab-bar";
import { sortModules, type SortableModule } from "@/lib/module-sort";

type SearchParams = Promise<{
  q?: string;
  difficulty?: string;
  tag?: string;
  category?: string;
  sort?: string;
}>;

export default async function ModulesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getTenantContext();
  const user = ctx.user;
  const params = await searchParams;
  const searchQuery = params.q ?? "";
  const difficultyFilter = params.difficulty ?? "";
  const tagFilter = params.tag ?? "";
  const categoryFilter = params.category ?? "";
  const sortBy = params.sort ?? "recommended";

  const isSuperAdmin = ctx.effectiveRole === "SUPER_ADMIN" || ctx.effectiveRole === "OWNER";

  // Module filter conditions (shared between admin and regular user queries)
  const moduleFilterWhere = {
    status: "PUBLISHED" as const,
    tenantId: ctx.tenantId,
    ...(searchQuery
      ? {
          OR: [
            { title: { contains: searchQuery, mode: "insensitive" as const } },
            { description: { contains: searchQuery, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(difficultyFilter
      ? { difficulty: difficultyFilter as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" }
      : {}),
    ...(tagFilter
      ? { tags: { some: { tag: { name: tagFilter } } } }
      : {}),
    ...(categoryFilter
      ? { categoryId: categoryFilter }
      : {}),
  };

  // Fetch categories, user pins, company pins, and user reviews in parallel
  const [categories, userPins, companyPins, userReviews] = await Promise.all([
    prisma.moduleCategory.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
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

  let modulesWithProgress: (ModuleCardProps & SortableModule)[];

  if (isSuperAdmin) {
    // SUPER_ADMIN sees ALL published modules (no group filtering)
    const allPublishedModules = await prisma.module.findMany({
      where: moduleFilterWhere,
      include: {
        tags: { include: { tag: true } },
        category: { select: { id: true, name: true } },
        mentors: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          },
        },
      },
    });

    // Batch-fetch progress for all modules in 6 queries (not 6*N)
    const progressMap = await getBatchedProgressForUser(
      user.id,
      allPublishedModules.map((m) => m.id),
      ctx.tenantId,
    );

    modulesWithProgress = allPublishedModules.map((module) => {
      const progress = progressMap.get(module.id)!;
      return {
        id: module.id,
        title: module.title,
        description: module.description,
        difficulty: module.difficulty,
        estimatedTime: module.estimatedTime,
        coverImage: module.coverImage,
        isMandatory: module.isMandatory,
        tags: module.tags.map((t) => t.tag.name),
        progress: {
          percentage: progress.percentage,
          status: progress.status,
          completedSections: progress.completedSections,
          totalSections: progress.totalSections,
        },
        deadline: null, // No per-user deadline for admin
        needsReview: module.version > (reviewMap.get(module.id) ?? 0),
        isUserPinned: userPinSet.has(module.id),
        isCompanyPinned: companyPinSet.has(module.id),
        categoryName: module.category?.name ?? null,
        mentors: module.mentors.map((m) => ({
          id: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          avatar: m.user.avatar,
        })),
      };
    });
  } else {
    // Regular user: get modules assigned via groups
    const userGroups = await prisma.userGroup.findMany({
      where: { userId: user.id },
      select: { groupId: true, assignedAt: true },
    });

    const groupIds = userGroups.map((ug) => ug.groupId);
    const groupAssignedAtMap = new Map(userGroups.map((ug) => [ug.groupId, ug.assignedAt]));

    const moduleGroups = await prisma.moduleGroup.findMany({
      where: {
        groupId: { in: groupIds },
        module: moduleFilterWhere,
      },
      include: {
        group: { select: { name: true } },
        module: {
          include: {
            tags: { include: { tag: true } },
            category: { select: { id: true, name: true } },
            mentors: {
              include: {
                user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
              },
            },
          },
        },
      },
    });

    // Deduplicate modules and compute per-user deadline from UserGroup.assignedAt + deadlineDays
    const uniqueModules = new Map<
      string,
      {
        module: (typeof moduleGroups)[0]["module"];
        deadline: Date | null;
        isMandatory: boolean;
        groupNames: string[];
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
          groupNames: [mg.group.name],
        });
      } else {
        if (computedDeadline && (!existing.deadline || computedDeadline < existing.deadline)) {
          existing.deadline = computedDeadline;
        }
        if (mg.isMandatory) {
          existing.isMandatory = true;
        }
        if (!existing.groupNames.includes(mg.group.name)) {
          existing.groupNames.push(mg.group.name);
        }
      }
    }

    // Batch-fetch progress for all modules in 6 queries (not 6*N)
    const uniqueModuleEntries = Array.from(uniqueModules.values());
    const progressMap = await getBatchedProgressForUser(
      user.id,
      uniqueModuleEntries.map((e) => e.module.id),
      ctx.tenantId,
    );

    modulesWithProgress = uniqueModuleEntries.map(({ module, deadline, isMandatory, groupNames }) => {
      const progress = progressMap.get(module.id)!;
      return {
        id: module.id,
        title: module.title,
        description: module.description,
        difficulty: module.difficulty,
        estimatedTime: module.estimatedTime,
        coverImage: module.coverImage,
        isMandatory,
        tags: module.tags.map((t) => t.tag.name),
        progress: {
          percentage: progress.percentage,
          status: progress.status,
          completedSections: progress.completedSections,
          totalSections: progress.totalSections,
        },
        deadline,
        needsReview: module.version > (reviewMap.get(module.id) ?? 0),
        isUserPinned: userPinSet.has(module.id),
        isCompanyPinned: companyPinSet.has(module.id),
        categoryName: module.category?.name ?? null,
        assignmentGroups: groupNames,
        mentors: module.mentors.map((m) => ({
          id: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          avatar: m.user.avatar,
        })),
      };
    });
  }

  // Get all available tags for filters
  const allTags = await prisma.tag.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  // Get recent chat activity per module (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const chatActivity = await prisma.chatMessage.groupBy({
    by: ["moduleId"],
    where: {
      tenantId: ctx.tenantId,
      moduleId: { not: null },
      createdAt: { gte: oneDayAgo },
      type: "MESSAGE",
    },
    _count: { id: true },
  });
  const chatActiveModuleIds = new Set(
    chatActivity.filter((g) => g.moduleId && g._count.id > 0).map((g) => g.moduleId!)
  );

  // Add recentChatActivity to modules
  for (const m of modulesWithProgress) {
    (m as ModuleCardProps & { recentChatActivity?: boolean }).recentChatActivity = chatActiveModuleIds.has(m.id);
  }

  // Sort modules using the sort utility
  const sortedModules = sortModules(modulesWithProgress, sortBy, companyPinSet, userPinSet);

  // Split into active and completed
  const activeModules = sortedModules.filter((m) => m.progress.status !== "COMPLETED");
  const completedModules = sortedModules.filter((m) => m.progress.status === "COMPLETED");

  const hasFilters = !!(searchQuery || difficultyFilter || tagFilter || categoryFilter);
  const totalModules = sortedModules.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("modules.title")}</h1>
        <p className="text-muted-foreground">
          {t("modules.subtitle")}
        </p>
      </div>

      {/* Category tab bar */}
      <CategoryTabBar
        categories={categories}
        currentCategory={categoryFilter}
      />

      <ModuleFilters
        availableTags={allTags.map((t) => t.name)}
        currentSearch={searchQuery}
        currentDifficulty={difficultyFilter}
        currentTag={tagFilter}
        currentSort={sortBy}
      />

      {totalModules === 0 ? (
        <div className="rounded-xl border border-border/40 bg-card">
          <div className="py-16 text-center text-muted-foreground">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
              <BookOpen className="h-7 w-7 opacity-40" />
            </div>
            <p className="font-medium">{t("modules.noModulesFound")}</p>
            <p className="text-sm mt-1 opacity-70">
              {hasFilters
                ? t("modules.adjustFilters")
                : t("modules.noModulesAssigned")}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* ─── Active Knowledge ─── */}
          {activeModules.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight">
                {t("modules.activeKnowledge")}
              </h2>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {activeModules.map((module) => (
                  <ModuleCard key={module.id} module={module} />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border/40 bg-card">
              <div className="py-10 text-center text-muted-foreground">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/30">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <p className="font-medium">{t("modules.noActiveModules")}</p>
                <p className="text-sm mt-1 opacity-70">{t("modules.noActiveModulesHint")}</p>
              </div>
            </div>
          )}

          {/* ─── Completed Knowledge (collapsed) ─── */}
          {completedModules.length > 0 && (
            <CompletedSection count={completedModules.length}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {completedModules.map((module) => (
                  <CompletedModuleCard key={module.id} module={module} />
                ))}
              </div>
            </CompletedSection>
          )}
        </div>
      )}
    </div>
  );
}
