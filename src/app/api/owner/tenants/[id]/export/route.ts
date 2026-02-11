import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { zipSync, strToU8 } from "fflate";

type Params = Promise<{ id: string }>;

// Safety limit: max rows per table to prevent OOM on large tenants
const MAX_ROWS = 50_000;

export async function GET(
  _req: Request,
  { params }: { params: Params },
) {
  // ── Auth: Owner only ───────────────────────────────────────
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    return new Response("Forbidden", { status: 403 });
  }

  const { id: tenantId } = await params;

  // ── Fetch tenant ───────────────────────────────────────────
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    return new Response("Not found", { status: 404 });
  }

  // ── Fetch all tenant data in parallel (with row limits) ────
  const [
    memberships,
    groups,
    userGroups,
    modules,
    sections,
    attachments,
    quizzes,
    quizQuestions,
    quizAttempts,
    sectionCompletions,
    progressOverrides,
    certificates,
    notifications,
    auditLogs,
    categories,
    tags,
    moduleTags,
    moduleGroups,
    companyPinnedModules,
    userModuleReviews,
    changeLogs,
    userSessions,
    modulePrerequisites,
    selfAssessments,
    moduleAccesses,
    // ── Additional tables (v1.1) ──
    chatMessages,
    liveEvents,
    liveEventGroups,
    radarPosts,
    radarSaves,
    emailPreferences,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId },
      take: MAX_ROWS,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
            // passwordHash intentionally excluded
          },
        },
      },
    }),
    prisma.group.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.userGroup.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.module.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.section.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.attachment.findMany({
      where: { tenantId },
      take: MAX_ROWS,
      select: {
        id: true,
        sectionId: true,
        tenantId: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        mimeType: true,
        checksum: true,
        uploadedAt: true,
        // storagePath excluded (internal path, not useful for export)
      },
    }),
    prisma.quiz.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.quizQuestion.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.quizAttempt.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.sectionCompletion.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.progressOverride.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.certificate.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.notification.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: MAX_ROWS }),
    prisma.moduleCategory.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.tag.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.moduleTag.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.moduleGroup.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.companyPinnedModule.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.userModuleReview.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.moduleChangeLog.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.userSession.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.modulePrerequisite.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.moduleSelfAssessment.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.userModuleLastAccess.findMany({ where: { tenantId }, take: MAX_ROWS }),
    // ── Additional tables (v1.1) ──
    prisma.chatMessage.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: MAX_ROWS }),
    prisma.mentorLiveEvent.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.liveEventGroup.findMany({ where: { tenantId }, take: MAX_ROWS }),
    prisma.mentorRadarPost.findMany({ where: { tenantId }, take: MAX_ROWS }),
    // RadarSave has no tenantId — join via posts
    prisma.radarSave.findMany({
      where: { post: { tenantId } },
      take: MAX_ROWS,
    }),
    prisma.emailPreference.findMany({ where: { tenantId }, take: MAX_ROWS }),
  ]);

  // ── Build ZIP ──────────────────────────────────────────────
  const toJson = (data: unknown) => strToU8(JSON.stringify(data, null, 2));

  const manifest = {
    tenantId: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    exportedAt: new Date().toISOString(),
    version: "1.1",
    maxRowsPerTable: MAX_ROWS,
  };

  // Strip tenantId from the tenant object for cleanliness (it's in manifest)
  const { id: _id, ...tenantData } = tenant;

  const files: Record<string, Uint8Array> = {
    "manifest.json": toJson(manifest),
    "company.json": toJson(tenantData),
    "users.json": toJson(
      memberships.map((m) => ({
        membership: { id: m.id, role: m.role, createdAt: m.createdAt },
        user: m.user,
      })),
    ),
    "groups.json": toJson(groups),
    "group_members.json": toJson(userGroups),
    "modules.json": toJson(modules),
    "sections.json": toJson(sections),
    "attachments.json": toJson(attachments),
    "quizzes.json": toJson(quizzes),
    "quiz_questions.json": toJson(quizQuestions),
    "quiz_attempts.json": toJson(quizAttempts),
    "section_completions.json": toJson(sectionCompletions),
    "progress_overrides.json": toJson(progressOverrides),
    "certificates.json": toJson(certificates),
    "notifications.json": toJson(notifications),
    "audit_log.json": toJson(auditLogs),
    "categories.json": toJson(categories),
    "tags.json": toJson(tags),
    "module_tags.json": toJson(moduleTags),
    "module_groups.json": toJson(moduleGroups),
    "company_pinned_modules.json": toJson(companyPinnedModules),
    "user_module_reviews.json": toJson(userModuleReviews),
    "change_logs.json": toJson(changeLogs),
    "user_sessions.json": toJson(userSessions),
    "module_prerequisites.json": toJson(modulePrerequisites),
    "self_assessments.json": toJson(selfAssessments),
    "module_accesses.json": toJson(moduleAccesses),
    // ── Additional tables (v1.1) ──
    "chat_messages.json": toJson(chatMessages),
    "live_events.json": toJson(liveEvents),
    "live_event_groups.json": toJson(liveEventGroups),
    "radar_posts.json": toJson(radarPosts),
    "radar_saves.json": toJson(radarSaves),
    "email_preferences.json": toJson(emailPreferences),
  };

  const zipped = zipSync(files);
  // Copy into a fresh Uint8Array backed by a plain ArrayBuffer
  // (fflate returns Uint8Array<ArrayBufferLike> which TS strict rejects as BodyInit)
  const body = new Uint8Array(zipped);

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="backup-${tenant.slug}-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Content-Length": String(zipped.length),
    },
  });
}
