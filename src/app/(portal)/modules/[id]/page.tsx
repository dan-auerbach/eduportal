import { redirect, notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getModuleProgress } from "@/lib/progress";
import { trackModuleAccess } from "@/lib/progress";
import { checkModuleAccess } from "@/lib/permissions";
import { SectionViewer } from "@/components/modules/section-viewer";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ preview?: string }>;

export default async function ModuleViewerPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const ctx = await getTenantContext();
  const user = ctx.user;
  const { id: moduleId } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === "true";

  // Check access
  if (!isPreview) {
    const hasAccess = await checkModuleAccess(user.id, moduleId, ctx.tenantId);
    if (!hasAccess) {
      redirect("/modules");
    }
  } else {
    // For preview mode, only admins/super-admins/owners can access
    const role = ctx.effectiveRole;
    if (role !== "ADMIN" && role !== "SUPER_ADMIN" && role !== "OWNER") {
      redirect("/modules");
    }
  }

  // Load module with sections and attachments (scoped to tenant)
  const module = await prisma.module.findUnique({
    where: { id: moduleId, tenantId: ctx.tenantId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
            },
          },
        },
      },
    },
  });

  if (!module) {
    notFound();
  }

  // Get completed section IDs for this user
  const completions = await prisma.sectionCompletion.findMany({
    where: {
      userId: user.id,
      section: { moduleId },
    },
    select: { sectionId: true },
  });

  const completedSectionIds = completions.map((c) => c.sectionId);

  // Get progress
  const progress = await getModuleProgress(user.id, moduleId, ctx.tenantId);

  // Track access (not in preview mode)
  if (!isPreview) {
    await trackModuleAccess(user.id, moduleId, ctx.tenantId);
  }

  // Check if module needs review (change tracking)
  let needsReview = false;
  let changeSummaryText: string | undefined;

  if (!isPreview) {
    const [userReview, latestChangeLog] = await Promise.all([
      prisma.userModuleReview.findUnique({
        where: {
          userId_moduleId: { userId: user.id, moduleId },
        },
        select: { lastSeenVersion: true },
      }),
      prisma.moduleChangeLog.findFirst({
        where: { moduleId },
        orderBy: { createdAt: "desc" },
        select: { changeSummary: true, version: true },
      }),
    ]);

    needsReview = userReview !== null && module.version > userReview.lastSeenVersion;
    if (needsReview && latestChangeLog) {
      changeSummaryText = latestChangeLog.changeSummary;
    }
  }

  const sectionsData = module.sections.map((s) => ({
    id: s.id,
    title: s.title,
    content: s.content,
    sortOrder: s.sortOrder,
    type: s.type,
    unlockAfterSectionId: s.unlockAfterSectionId,
    attachments: s.attachments,
  }));

  // Load quiz data for sidebar
  const quizzes = await prisma.quiz.findMany({
    where: { moduleId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      attempts: {
        where: { userId: user.id, passed: true },
        take: 1,
        select: { id: true },
      },
    },
  });

  const quizData = quizzes.map((q) => ({
    id: q.id,
    title: q.title,
    passed: q.attempts.length > 0,
  }));

  return (
    <div className="space-y-4">
      <SectionViewer
        moduleId={moduleId}
        moduleTitle={module.title}
        sections={sectionsData}
        completedSectionIds={completedSectionIds}
        isPreview={isPreview}
        progressPercentage={progress.percentage}
        needsReview={needsReview}
        changeSummary={changeSummaryText}
        quizzes={quizData}
      />
    </div>
  );
}
