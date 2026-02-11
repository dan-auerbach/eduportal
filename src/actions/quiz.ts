"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { checkModuleAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getTenantContext } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import { getModuleProgress } from "@/lib/progress";
import type { ActionResult } from "@/types";
import type { QuestionType } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuizOption = { text: string; isCorrect: boolean };

export type QuizQuestionForAttempt = {
  id: string;
  question: string;
  type: QuestionType;
  options: { text: string }[]; // isCorrect stripped
  points: number;
};

export type QuizForAttempt = {
  id: string;
  title: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number;
  timeLimit: number | null;
  questions: QuizQuestionForAttempt[];
  previousAttempts: number;
  bestScore: number | null;
  hasPassed: boolean;
  moduleId: string;
  moduleTitle: string;
};

export type QuizSubmitResult = {
  score: number;
  passed: boolean;
  certificateIssued: boolean;
  attemptsRemaining: number | null; // null = unlimited (maxAttempts=0)
  results: {
    questionId: string;
    correct: boolean;
    correctOptions: number[];
    selectedOptions: number[];
    explanation: string | null;
  }[];
};

// ---------------------------------------------------------------------------
// getQuizForAttempt - load quiz for a user to attempt (tenant-scoped)
// ---------------------------------------------------------------------------
export async function getQuizForAttempt(
  quizId: string
): Promise<ActionResult<QuizForAttempt>> {
  try {
    const ctx = await getTenantContext();

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        module: { select: { id: true, title: true, tenantId: true } },
        questions: {
          orderBy: { sortOrder: "asc" },
        },
        attempts: {
          where: { userId: ctx.user.id },
          orderBy: { startedAt: "desc" },
        },
      },
    });

    if (!quiz) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    // Verify quiz module belongs to active tenant
    if (quiz.module.tenantId !== ctx.tenantId) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    // Check that the user has access to this module (via group or admin role)
    const hasAccess = await checkModuleAccess(ctx.user.id, quiz.moduleId, ctx.tenantId);
    if (!hasAccess) {
      return { success: false, error: "Nimate dostopa do tega modula" };
    }

    // Check that all sections are completed (sections only, not quiz — avoid circular dependency)
    const progress = await getModuleProgress(ctx.user.id, quiz.moduleId, ctx.tenantId);
    if (progress.completedSections < progress.totalSections) {
      return {
        success: false,
        error: "Zaključite vse sekcije pred poskusom kviza",
      };
    }

    // Check max attempts
    const previousAttempts = quiz.attempts.length;
    const hasPassed = quiz.attempts.some((a) => a.passed);

    if (
      quiz.maxAttempts > 0 &&
      previousAttempts >= quiz.maxAttempts &&
      !hasPassed
    ) {
      return { success: false, error: "Porabili ste vse poskuse" };
    }

    // Reject quizzes with no questions (admin forgot to add them)
    if (quiz.questions.length === 0) {
      return { success: false, error: "Kviz nima vprašanj" };
    }

    // Strip isCorrect from options
    const questions: QuizQuestionForAttempt[] = quiz.questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: (q.options as QuizOption[]).map((o) => ({ text: o.text })),
      points: q.points,
    }));

    const bestScore =
      quiz.attempts.length > 0
        ? Math.max(...quiz.attempts.map((a) => a.score))
        : null;

    return {
      success: true,
      data: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        timeLimit: quiz.timeLimit,
        questions,
        previousAttempts,
        bestScore,
        hasPassed,
        moduleId: quiz.module.id,
        moduleTitle: quiz.module.title,
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error:
        e instanceof Error ? e.message : "Napaka pri nalaganju kviza",
    };
  }
}

// ---------------------------------------------------------------------------
// submitQuizAttempt - grade + save attempt + maybe issue certificate (tenant-scoped)
// ---------------------------------------------------------------------------
export async function submitQuizAttempt(
  quizId: string,
  answers: Record<string, number[]> // questionId -> selected option indices
): Promise<ActionResult<QuizSubmitResult>> {
  try {
    const ctx = await getTenantContext();

    const quiz = await prisma.quiz.findUnique({
      where: { id: quizId },
      include: {
        module: { select: { id: true, tenantId: true } },
        questions: { orderBy: { sortOrder: "asc" } },
        attempts: { where: { userId: ctx.user.id } },
      },
    });

    if (!quiz) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    // Verify quiz module belongs to active tenant
    if (quiz.module.tenantId !== ctx.tenantId) {
      return { success: false, error: "Kviz ne obstaja" };
    }

    // Check all sections completed (sections only, not quiz — avoid circular dependency)
    const progress = await getModuleProgress(ctx.user.id, quiz.moduleId, ctx.tenantId);
    if (progress.completedSections < progress.totalSections) {
      return {
        success: false,
        error: "Zaključite vse sekcije pred poskusom kviza",
      };
    }

    // Reject quizzes with no questions
    if (quiz.questions.length === 0) {
      return { success: false, error: "Kviz nima vprašanj" };
    }

    // Check max attempts
    const previousAttempts = quiz.attempts.length;
    if (quiz.maxAttempts > 0 && previousAttempts >= quiz.maxAttempts) {
      return { success: false, error: "Porabili ste vse poskuse" };
    }

    // Grade each question
    let earnedPoints = 0;
    let totalPoints = 0;

    const results = quiz.questions.map((q) => {
      const options = q.options as QuizOption[];
      const correctIndices = options
        .map((o, i) => (o.isCorrect ? i : -1))
        .filter((i) => i !== -1);
      const selectedIndices = answers[q.id] || [];

      totalPoints += q.points;

      // Check if answer is correct
      const isCorrect =
        correctIndices.length === selectedIndices.length &&
        correctIndices.every((ci) => selectedIndices.includes(ci)) &&
        selectedIndices.every((si) => correctIndices.includes(si));

      if (isCorrect) {
        earnedPoints += q.points;
      }

      return {
        questionId: q.id,
        correct: isCorrect,
        correctOptions: correctIndices,
        selectedOptions: selectedIndices,
        explanation: q.explanation,
      };
    });

    const score =
      totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
    const passed = score >= quiz.passingScore;

    // Save attempt
    await prisma.quizAttempt.create({
      data: {
        quizId,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        score,
        passed,
        answers: JSON.parse(JSON.stringify(answers)),
        completedAt: new Date(),
      },
    });

    // Audit log
    await logAudit({
      actorId: ctx.user.id,
      action: "QUIZ_ATTEMPTED",
      entityType: "Quiz",
      entityId: quizId,
      tenantId: ctx.tenantId,
      metadata: { moduleId: quiz.moduleId, score, passed },
    });

    // If passed, check if module is now fully completed and issue certificate
    let certificateIssued = false;
    if (passed) {
      const updatedProgress = await getModuleProgress(
        ctx.user.id,
        quiz.moduleId,
        ctx.tenantId
      );
      if (
        updatedProgress.status === "COMPLETED" &&
        !updatedProgress.certificateIssued
      ) {
        if (
          !updatedProgress.hasOverride ||
          updatedProgress.overrideAllowsCertificate
        ) {
          await prisma.certificate.create({
            data: {
              userId: ctx.user.id,
              moduleId: quiz.moduleId,
              tenantId: ctx.tenantId,
            },
          });

          await logAudit({
            actorId: ctx.user.id,
            action: "CERTIFICATE_ISSUED",
            entityType: "Certificate",
            entityId: quiz.moduleId,
            tenantId: ctx.tenantId,
            metadata: { userId: ctx.user.id, moduleId: quiz.moduleId },
          });

          certificateIssued = true;
        }
      }
    }

    const attemptsRemaining =
      quiz.maxAttempts > 0
        ? quiz.maxAttempts - (previousAttempts + 1)
        : null;

    return {
      success: true,
      data: {
        score,
        passed,
        certificateIssued,
        attemptsRemaining,
        results,
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Napaka pri oddaji kviza",
    };
  }
}
