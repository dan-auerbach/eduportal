import { prisma } from "./prisma";

export type ModuleProgress = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_QUIZ" | "COMPLETED";
  completedSections: number;
  totalSections: number;
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

  const percentage =
    totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

  const quizResults = quizzes.map((q) => ({
    quizId: q.id,
    quizTitle: q.title,
    passed: q.attempts.length > 0,
  }));

  const allQuizzesPassed = quizzes.length === 0 || quizResults.every((q) => q.passed);
  const hasQuizzes = quizzes.length > 0;
  const hasOverride = !!override;

  let status: ModuleProgress["status"] = "NOT_STARTED";
  if (hasOverride || (percentage === 100 && allQuizzesPassed)) {
    status = "COMPLETED";
  } else if (percentage === 100 && hasQuizzes && !allQuizzesPassed) {
    status = "READY_FOR_QUIZ";
  } else if (completedSections > 0 || quizzes.some((q) => q.attempts.length > 0)) {
    status = "IN_PROGRESS";
  }

  return {
    status,
    completedSections,
    totalSections,
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

export async function trackModuleAccess(userId: string, moduleId: string, tenantId: string) {
  await prisma.userModuleLastAccess.upsert({
    where: { userId_moduleId: { userId, moduleId } },
    create: { userId, moduleId, tenantId },
    update: { lastAccessedAt: new Date() },
  });
}
