"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission, hasPermission, ForbiddenError } from "@/lib/permissions";
import { rateLimitAiEditor } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types";

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireModuleAccess(moduleId: string) {
  const currentUser = await getCurrentUser();
  const ctx = await getTenantContext();

  const module = await prisma.module.findUnique({
    where: { id: moduleId, tenantId: ctx.tenantId },
  });
  if (!module) throw new Error("Modul ne obstaja");

  const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
  if (!canManageAll) {
    if (module.createdById !== currentUser.id) {
      throw new ForbiddenError("Nimate pravic za urejanje tega modula");
    }
    await requirePermission(currentUser, "MANAGE_OWN_MODULES");
  }

  // Rate limit
  const rl = await rateLimitAiEditor(currentUser.id);
  if (!rl.success) {
    throw new Error("AI_RATE_LIMITED");
  }

  return { currentUser, ctx, module };
}

// ── aiGenerateMetadata ──────────────────────────────────────────────────────

export async function aiGenerateMetadata(params: {
  moduleId: string;
  currentTitle: string;
  currentDescription: string;
  sectionTitles: string[];
}): Promise<ActionResult<{ title: string; description: string }>> {
  try {
    const { currentUser, ctx } = await requireModuleAccess(params.moduleId);

    const { generateModuleMetadata } = await import(
      "@/lib/ai/generate-module-metadata"
    );

    const result = await generateModuleMetadata({
      currentTitle: params.currentTitle,
      currentDescription: params.currentDescription,
      sectionTitles: params.sectionTitles,
      language: ctx.tenantLocale,
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: params.moduleId,
      tenantId: ctx.tenantId,
      metadata: { aiAction: "generate_metadata" },
    });

    return { success: true, data: result };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    const msg = e instanceof Error ? e.message : "AI generacija ni uspela";
    return { success: false, error: msg };
  }
}

// ── aiGenerateTags ──────────────────────────────────────────────────────────

export async function aiGenerateTags(params: {
  moduleId: string;
  title: string;
  description: string;
  sectionTitles: string[];
  existingTags: string[];
}): Promise<ActionResult<{ tags: string[] }>> {
  try {
    const { currentUser, ctx } = await requireModuleAccess(params.moduleId);

    const { generateModuleTags } = await import(
      "@/lib/ai/generate-module-metadata"
    );

    const tags = await generateModuleTags({
      title: params.title,
      description: params.description,
      sectionTitles: params.sectionTitles,
      existingTags: params.existingTags,
      language: ctx.tenantLocale,
    });

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: params.moduleId,
      tenantId: ctx.tenantId,
      metadata: { aiAction: "generate_tags", tags },
    });

    return { success: true, data: { tags } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    const msg = e instanceof Error ? e.message : "AI generacija ni uspela";
    return { success: false, error: msg };
  }
}

// ── aiGenerateQuiz ──────────────────────────────────────────────────────────

export async function aiGenerateQuiz(params: {
  moduleId: string;
}): Promise<ActionResult<{ quizId: string; questionCount: number }>> {
  try {
    const { currentUser, ctx } = await requireModuleAccess(params.moduleId);

    // Fetch module with sections for content
    const module = await prisma.module.findUnique({
      where: { id: params.moduleId, tenantId: ctx.tenantId },
      include: {
        sections: {
          orderBy: { sortOrder: "asc" },
          select: { title: true, content: true },
        },
      },
    });

    if (!module) {
      return { success: false, error: "Modul ne obstaja" };
    }

    if (module.sections.length === 0) {
      return { success: false, error: "AI_QUIZ_NO_CONTENT" };
    }

    const { generateQuiz } = await import("@/lib/ai/generate-quiz");

    const quizData = await generateQuiz({
      title: module.title,
      description: module.description,
      sectionContent: module.sections.map((s) => ({
        title: s.title,
        content: s.content,
      })),
      language: ctx.tenantLocale,
    });

    // Create quiz + questions in transaction
    const maxSort = await prisma.quiz.aggregate({
      where: { moduleId: params.moduleId },
      _max: { sortOrder: true },
    });
    const nextQuizOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const quiz = await prisma.quiz.create({
      data: {
        moduleId: params.moduleId,
        tenantId: ctx.tenantId,
        title: "AI Kviz",
        passingScore: 70,
        maxAttempts: 3,
        sortOrder: nextQuizOrder,
      },
    });

    // Create questions
    for (let i = 0; i < quizData.questions.length; i++) {
      const q = quizData.questions[i];
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      const questionType = correctCount > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE";

      await prisma.quizQuestion.create({
        data: {
          quizId: quiz.id,
          tenantId: ctx.tenantId,
          question: q.question,
          options: q.options,
          type: questionType,
          sortOrder: i,
        },
      });
    }

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: params.moduleId,
      tenantId: ctx.tenantId,
      metadata: {
        aiAction: "generate_quiz",
        quizId: quiz.id,
        questionCount: quizData.questions.length,
      },
    });

    return {
      success: true,
      data: { quizId: quiz.id, questionCount: quizData.questions.length },
    };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    const msg = e instanceof Error ? e.message : "AI generacija ni uspela";
    return { success: false, error: msg };
  }
}

// ── aiGenerateCoverImage ────────────────────────────────────────────────────

export async function aiGenerateCoverImage(params: {
  moduleId: string;
  title: string;
  description: string;
}): Promise<ActionResult<{ coverUrl: string }>> {
  try {
    const { currentUser, ctx } = await requireModuleAccess(params.moduleId);

    const { generateCoverImage } = await import(
      "@/lib/ai/generate-cover-image"
    );

    const imageBuffer = await generateCoverImage({
      title: params.title,
      description: params.description,
    });

    // Process with sharp (same as cover-upload)
    const sharp = (await import("sharp")).default;
    const processed = await sharp(imageBuffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();

    // Store via storage abstraction
    const { storage } = await import("@/lib/storage");
    const crypto = await import("crypto");
    const hash = crypto
      .createHash("md5")
      .update(processed)
      .digest("hex")
      .slice(0, 12);
    const random = crypto.randomBytes(4).toString("hex");
    const key = `covers/${hash}-${random}.jpg`;

    await storage.put(key, processed, "image/jpeg");

    const coverUrl = `/api/covers/${hash}-${random}.jpg`;

    await logAudit({
      actorId: currentUser.id,
      action: "MODULE_UPDATED",
      entityType: "Module",
      entityId: params.moduleId,
      tenantId: ctx.tenantId,
      metadata: { aiAction: "generate_cover_image", coverUrl },
    });

    return { success: true, data: { coverUrl } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    const msg = e instanceof Error ? e.message : "AI generacija ni uspela";
    return { success: false, error: msg };
  }
}
