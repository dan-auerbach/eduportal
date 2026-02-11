import { prisma } from "./prisma";

export type ModuleProgress = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_QUIZ" | "COMPLETED";
  completedSections: number;
  totalSections: number;
  totalSteps: number;
  completedSteps: number;
  percentage: number;
  quizResults: { quizId: string; quizTitle: string; passed: boolean }[];
  allQuizzesPassed: boolean;
  hasQuizzes: boolean;
  hasOverride: boolean;
  overrideAllowsCertificate: boolean;
  certificateIssued: boolean;
  lastAccessedAt: Date | null;
};

export async function getModuleProgress(userId: string, moduleId: string, tenantId: string): Promise<ModuleProgress> {
  const [totalSections, completedSections, quizzes, override, certificate, lastAccess] =
    await prisma.$transaction([
      prisma.section.count({ where: { moduleId } }),
      prisma.sectionCompletion.count({ where: { userId, section: { moduleId } } }),
      prisma.quiz.findMany({
        where: { moduleId },
        include: {
          attempts: {
            where: { userId, passed: true },
            take: 1,
          },
        },
      }),
      prisma.progressOverride.findFirst({ where: { userId, moduleId } }),
      prisma.certificate.findFirst({ where: { userId, moduleId } }),
      prisma.userModuleLastAccess.findFirst({ where: { userId, moduleId } }),
    ]);

  const quizResults = quizzes.map((q) => ({
    quizId: q.id,
    quizTitle: q.title,
    passed: q.attempts.length > 0,
  }));

  const passedQuizCount = quizResults.filter((q) => q.passed).length;
  const allQuizzesPassed = quizzes.length === 0 || quizResults.every((q) => q.passed);
  const hasQuizzes = quizzes.length > 0;
  const hasOverride = !!override;

  // Quiz counts as a step in the percentage
  const totalSteps = totalSections + quizzes.length;
  const completedSteps = completedSections + passedQuizCount;
  const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  let status: ModuleProgress["status"] = "NOT_STARTED";
  if (hasOverride || (completedSections >= totalSections && allQuizzesPassed)) {
    status = "COMPLETED";
  } else if (completedSections >= totalSections && hasQuizzes && !allQuizzesPassed) {
    status = "READY_FOR_QUIZ";
  } else if (completedSections > 0 || quizzes.some((q) => q.attempts.length > 0)) {
    status = "IN_PROGRESS";
  }

  return {
    status,
    completedSections,
    totalSections,
    totalSteps,
    completedSteps,
    percentage,
    quizResults,
    allQuizzesPassed,
    hasQuizzes,
    hasOverride,
    overrideAllowsCertificate: override?.allowCertificate ?? false,
    certificateIssued: !!certificate,
    lastAccessedAt: lastAccess?.lastAccessedAt ?? null,
  };
}

// ── Batched progress for tenant-wide analytics ─────────────────────────

export type BatchedProgressEntry = {
  userId: string;
  moduleId: string;
  status: ModuleProgress["status"];
  percentage: number;
  lastAccessedAt: Date | null;
};

export type BatchedProgressResult = {
  entries: BatchedProgressEntry[];
  userMap: Map<string, { firstName: string; lastName: string; email: string; groupIds: string[] }>;
  moduleMap: Map<string, { title: string }>;
  groupModuleMap: Map<string, Set<string>>; // groupId → Set<moduleId>
  groupNameMap: Map<string, string>; // groupId → name
};

export async function getBatchedProgressForTenant(
  tenantId: string,
  filterGroupId?: string,
  filterModuleId?: string,
): Promise<BatchedProgressResult> {
  // ── 1. Batch-fetch all data in parallel ──────────────────────────────
  const [
    users,
    moduleGroups,
    modules,
    sectionCountsRaw,
    completionsRaw,
    overridesRaw,
    lastAccessRaw,
    quizzesRaw,
    passedAttemptsRaw,
    groups,
  ] = await Promise.all([
    // Q1: Users with their group memberships
    prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        memberships: { some: { tenantId } },
        ...(filterGroupId ? { groups: { some: { groupId: filterGroupId } } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        groups: {
          where: { group: { tenantId } },
          select: { groupId: true },
        },
      },
    }),
    // Q2: Module-group assignments
    prisma.moduleGroup.findMany({
      where: {
        module: { status: "PUBLISHED", tenantId },
        ...(filterGroupId ? { groupId: filterGroupId } : {}),
        ...(filterModuleId ? { moduleId: filterModuleId } : {}),
      },
      select: { moduleId: true, groupId: true },
    }),
    // Q3: Published modules (id + title)
    prisma.module.findMany({
      where: {
        status: "PUBLISHED",
        tenantId,
        ...(filterModuleId ? { id: filterModuleId } : {}),
      },
      select: { id: true, title: true },
    }),
    // Q4: Section counts per module
    prisma.section.groupBy({
      by: ["moduleId"],
      where: { module: { tenantId, status: "PUBLISHED" } },
      _count: { id: true },
    }),
    // Q5: All section completions for the tenant
    prisma.sectionCompletion.findMany({
      where: { tenantId },
      select: {
        userId: true,
        section: { select: { moduleId: true } },
      },
    }),
    // Q6: All progress overrides
    prisma.progressOverride.findMany({
      where: { tenantId },
      select: { userId: true, moduleId: true },
    }),
    // Q7: All last-access records
    prisma.userModuleLastAccess.findMany({
      where: { tenantId },
      select: { userId: true, moduleId: true, lastAccessedAt: true },
    }),
    // Q8a: All quizzes (to know which modules have quizzes and how many)
    prisma.quiz.findMany({
      where: { module: { tenantId, status: "PUBLISHED" } },
      select: { id: true, moduleId: true },
    }),
    // Q8b: Passed quiz attempts (distinct per user+quiz)
    prisma.quizAttempt.findMany({
      where: { tenantId, passed: true },
      select: {
        userId: true,
        quiz: { select: { id: true, moduleId: true } },
      },
      distinct: ["userId", "quizId"],
    }),
    // Q9: All groups for names
    prisma.group.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);

  // ── 2. Build lookup maps ─────────────────────────────────────────────

  // User map
  const userMap = new Map<string, { firstName: string; lastName: string; email: string; groupIds: string[] }>();
  const userGroupIds = new Map<string, Set<string>>();
  for (const u of users) {
    const gids = u.groups.map((g) => g.groupId);
    userMap.set(u.id, { firstName: u.firstName, lastName: u.lastName, email: u.email, groupIds: gids });
    userGroupIds.set(u.id, new Set(gids));
  }

  // Module map
  const moduleMap = new Map<string, { title: string }>();
  for (const m of modules) {
    moduleMap.set(m.id, { title: m.title });
  }

  // Group-module assignment map (groupId → Set<moduleId>)
  const groupModuleMap = new Map<string, Set<string>>();
  for (const mg of moduleGroups) {
    if (!groupModuleMap.has(mg.groupId)) groupModuleMap.set(mg.groupId, new Set());
    groupModuleMap.get(mg.groupId)!.add(mg.moduleId);
  }

  // Group name map
  const groupNameMap = new Map<string, string>();
  for (const g of groups) {
    groupNameMap.set(g.id, g.name);
  }

  // Section count per module
  const sectionCountMap = new Map<string, number>();
  for (const sc of sectionCountsRaw) {
    sectionCountMap.set(sc.moduleId, sc._count.id);
  }

  // Completion count per userId:moduleId
  const completionCountMap = new Map<string, number>();
  for (const c of completionsRaw) {
    const key = `${c.userId}:${c.section.moduleId}`;
    completionCountMap.set(key, (completionCountMap.get(key) ?? 0) + 1);
  }

  // Override set
  const overrideSet = new Set<string>();
  for (const o of overridesRaw) {
    overrideSet.add(`${o.userId}:${o.moduleId}`);
  }

  // Last access map
  const lastAccessMap = new Map<string, Date>();
  for (const la of lastAccessRaw) {
    lastAccessMap.set(`${la.userId}:${la.moduleId}`, la.lastAccessedAt);
  }

  // Quiz map: moduleId → Set<quizId>
  const moduleQuizMap = new Map<string, Set<string>>();
  for (const q of quizzesRaw) {
    if (!moduleQuizMap.has(q.moduleId)) moduleQuizMap.set(q.moduleId, new Set());
    moduleQuizMap.get(q.moduleId)!.add(q.id);
  }

  // Passed quizzes: "userId:moduleId" → Set<quizId>
  const userPassedQuizMap = new Map<string, Set<string>>();
  for (const pa of passedAttemptsRaw) {
    const key = `${pa.userId}:${pa.quiz.moduleId}`;
    if (!userPassedQuizMap.has(key)) userPassedQuizMap.set(key, new Set());
    userPassedQuizMap.get(key)!.add(pa.quiz.id);
  }

  // ── 3. Determine user-module pairs (join users → groups → modules) ──

  // Build set of moduleIds that are assigned to at least one group
  const assignedModuleIds = new Set<string>();
  for (const mg of moduleGroups) {
    assignedModuleIds.add(mg.moduleId);
  }

  // For each user, find which modules they're assigned to (via group overlap)
  const pairSet = new Set<string>(); // dedup "userId:moduleId"
  const entries: BatchedProgressEntry[] = [];

  for (const user of users) {
    const uGroups = userGroupIds.get(user.id);
    if (!uGroups) continue;

    // Collect all moduleIds assigned to any of user's groups
    const userModuleIds = new Set<string>();
    for (const gid of uGroups) {
      const mods = groupModuleMap.get(gid);
      if (mods) {
        for (const mid of mods) userModuleIds.add(mid);
      }
    }

    for (const moduleId of userModuleIds) {
      const pairKey = `${user.id}:${moduleId}`;
      if (pairSet.has(pairKey)) continue;
      pairSet.add(pairKey);

      // Compute progress
      const totalSections = sectionCountMap.get(moduleId) ?? 0;
      const completedSections = completionCountMap.get(pairKey) ?? 0;
      const hasOverride = overrideSet.has(pairKey);
      const lastAccessedAt = lastAccessMap.get(pairKey) ?? null;

      const moduleQuizIds = moduleQuizMap.get(moduleId);
      const hasQuizzes = !!moduleQuizIds && moduleQuizIds.size > 0;
      const passedQuizIds = userPassedQuizMap.get(pairKey);
      const passedQuizCount = passedQuizIds?.size ?? 0;
      const allQuizzesPassed = !hasQuizzes || (!!passedQuizIds && passedQuizIds.size >= (moduleQuizIds?.size ?? 0));

      // Quiz counts as a step in the percentage
      const quizCount = moduleQuizIds?.size ?? 0;
      const totalSteps = totalSections + quizCount;
      const completedSteps = completedSections + passedQuizCount;
      const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

      // Status (mirrors getModuleProgress logic exactly)
      let status: ModuleProgress["status"] = "NOT_STARTED";
      if (hasOverride || (completedSections >= totalSections && allQuizzesPassed)) {
        status = "COMPLETED";
      } else if (completedSections >= totalSections && hasQuizzes && !allQuizzesPassed) {
        status = "READY_FOR_QUIZ";
      } else if (completedSections > 0 || (passedQuizIds && passedQuizIds.size > 0)) {
        status = "IN_PROGRESS";
      }

      entries.push({ userId: user.id, moduleId, status, percentage, lastAccessedAt });
    }
  }

  return { entries, userMap, moduleMap, groupModuleMap, groupNameMap };
}

// ── Batched progress for a single user across multiple modules ──────────

/**
 * Compute progress for a single user across many modules in bulk (6 queries total).
 * Replaces the N+1 pattern of calling getModuleProgress() per-module.
 */
export async function getBatchedProgressForUser(
  userId: string,
  moduleIds: string[],
  tenantId: string,
): Promise<Map<string, ModuleProgress>> {
  if (moduleIds.length === 0) return new Map();

  const [
    sectionCountsRaw,
    completionsRaw,
    quizzesRaw,
    overridesRaw,
    certificatesRaw,
    lastAccessRaw,
  ] = await Promise.all([
    // Q1: Section counts per module
    prisma.section.groupBy({
      by: ["moduleId"],
      where: { moduleId: { in: moduleIds } },
      _count: { id: true },
    }),
    // Q2: Completed sections for this user in these modules
    prisma.sectionCompletion.findMany({
      where: { userId, section: { moduleId: { in: moduleIds } } },
      select: { section: { select: { moduleId: true } } },
    }),
    // Q3: Quizzes with passed attempts for this user
    prisma.quiz.findMany({
      where: { moduleId: { in: moduleIds } },
      include: {
        attempts: {
          where: { userId, passed: true },
          take: 1,
        },
      },
    }),
    // Q4: Progress overrides
    prisma.progressOverride.findMany({
      where: { userId, moduleId: { in: moduleIds } },
      select: { moduleId: true, allowCertificate: true },
    }),
    // Q5: Certificates
    prisma.certificate.findMany({
      where: { userId, moduleId: { in: moduleIds } },
      select: { moduleId: true },
    }),
    // Q6: Last access
    prisma.userModuleLastAccess.findMany({
      where: { userId, moduleId: { in: moduleIds } },
      select: { moduleId: true, lastAccessedAt: true },
    }),
  ]);

  // Build lookup maps
  const sectionCountMap = new Map<string, number>();
  for (const sc of sectionCountsRaw) {
    sectionCountMap.set(sc.moduleId, sc._count.id);
  }

  const completionCountMap = new Map<string, number>();
  for (const c of completionsRaw) {
    const mid = c.section.moduleId;
    completionCountMap.set(mid, (completionCountMap.get(mid) ?? 0) + 1);
  }

  // Group quizzes by module
  const moduleQuizMap = new Map<string, typeof quizzesRaw>();
  for (const q of quizzesRaw) {
    if (!moduleQuizMap.has(q.moduleId)) moduleQuizMap.set(q.moduleId, []);
    moduleQuizMap.get(q.moduleId)!.push(q);
  }

  const overrideMap = new Map<string, { allowCertificate: boolean }>();
  for (const o of overridesRaw) {
    overrideMap.set(o.moduleId, { allowCertificate: o.allowCertificate });
  }

  const certificateSet = new Set<string>();
  for (const c of certificatesRaw) {
    certificateSet.add(c.moduleId);
  }

  const lastAccessMap = new Map<string, Date>();
  for (const la of lastAccessRaw) {
    lastAccessMap.set(la.moduleId, la.lastAccessedAt);
  }

  // Compute progress per module
  const result = new Map<string, ModuleProgress>();

  for (const moduleId of moduleIds) {
    const totalSections = sectionCountMap.get(moduleId) ?? 0;
    const completedSections = completionCountMap.get(moduleId) ?? 0;

    const quizzes = moduleQuizMap.get(moduleId) ?? [];
    const quizResults = quizzes.map((q) => ({
      quizId: q.id,
      quizTitle: q.title,
      passed: q.attempts.length > 0,
    }));
    const passedQuizCount = quizResults.filter((q) => q.passed).length;
    const allQuizzesPassed = quizzes.length === 0 || quizResults.every((q) => q.passed);
    const hasQuizzes = quizzes.length > 0;

    // Quiz counts as a step in the percentage
    const totalSteps = totalSections + quizzes.length;
    const completedSteps = completedSections + passedQuizCount;
    const percentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    const override = overrideMap.get(moduleId);
    const hasOverride = !!override;

    let status: ModuleProgress["status"] = "NOT_STARTED";
    if (hasOverride || (completedSections >= totalSections && allQuizzesPassed)) {
      status = "COMPLETED";
    } else if (completedSections >= totalSections && hasQuizzes && !allQuizzesPassed) {
      status = "READY_FOR_QUIZ";
    } else if (completedSections > 0 || quizzes.some((q) => q.attempts.length > 0)) {
      status = "IN_PROGRESS";
    }

    result.set(moduleId, {
      status,
      completedSections,
      totalSections,
      totalSteps,
      completedSteps,
      percentage,
      quizResults,
      allQuizzesPassed,
      hasQuizzes,
      hasOverride,
      overrideAllowsCertificate: override?.allowCertificate ?? false,
      certificateIssued: certificateSet.has(moduleId),
      lastAccessedAt: lastAccessMap.get(moduleId) ?? null,
    });
  }

  return result;
}

export async function trackModuleAccess(userId: string, moduleId: string, tenantId: string) {
  await prisma.userModuleLastAccess.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: { userId, moduleId, tenantId },
    update: { lastAccessedAt: new Date() },
  });
}
