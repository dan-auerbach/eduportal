import { redirect, notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getModuleProgress } from "@/lib/progress";
import { trackModuleAccess } from "@/lib/progress";
import { checkModuleAccess } from "@/lib/permissions";
import { SectionViewer } from "@/components/modules/section-viewer";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ preview?: string; tab?: string }>;

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
  const { preview, tab } = await searchParams;
  const isPreview = preview === "true";
  const initialTab = tab === "chat" ? "chat" : "content";

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
      mentors: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
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
    videoSourceType: s.videoSourceType,
    videoBlobUrl: s.videoBlobUrl,
    videoMimeType: s.videoMimeType,
    cloudflareStreamUid: s.cloudflareStreamUid,
    videoStatus: s.videoStatus,
    attachments: s.attachments,
  }));

  // Load quiz data for sidebar (only quizzes that have questions)
  const quizzes = await prisma.quiz.findMany({
    where: { moduleId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      _count: { select: { questions: true } },
      attempts: {
        where: { userId: user.id, passed: true },
        take: 1,
        select: { id: true },
      },
    },
  });

  const quizData = quizzes
    .filter((q) => q._count.questions > 0)
    .map((q) => ({
      id: q.id,
      title: q.title,
      passed: q.attempts.length > 0,
    }));

  // Compute assignment groups for this user + module
  let assignmentGroups: string[] = [];
  const isSuperAdmin = ctx.effectiveRole === "SUPER_ADMIN" || ctx.effectiveRole === "OWNER";
  if (!isSuperAdmin && !isPreview) {
    const userGroupRows = await prisma.userGroup.findMany({
      where: { userId: user.id },
      select: { groupId: true },
    });
    const userGroupIds = userGroupRows.map((ug) => ug.groupId);
    if (userGroupIds.length > 0) {
      const matchingModuleGroups = await prisma.moduleGroup.findMany({
        where: {
          moduleId,
          groupId: { in: userGroupIds },
        },
        include: { group: { select: { name: true } } },
      });
      assignmentGroups = matchingModuleGroups.map((mg) => mg.group.name);
    }
  }

  // Chat props
  const mentorIds = module.mentors.map((m) => m.user.id);
  const isMentorForModule = mentorIds.includes(user.id);
  const role = ctx.effectiveRole;
  const isAdminRole = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";
  const canConfirmAnswers = isMentorForModule || isAdminRole;
  const userDisplayName = `${user.firstName} ${user.lastName}`.trim() || user.email.split("@")[0];

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
        mentors={module.mentors.map((m) => ({
          id: m.user.id,
          firstName: m.user.firstName,
          lastName: m.user.lastName,
          avatar: m.user.avatar,
        }))}
        assignmentGroups={assignmentGroups}
        chatEnabled={!isPreview}
        tenantId={ctx.tenantId}
        userId={user.id}
        userDisplayName={userDisplayName}
        mentorIds={mentorIds}
        canConfirmAnswers={canConfirmAnswers}
        initialTab={initialTab as "content" | "chat"}
      />
    </div>
  );
}
