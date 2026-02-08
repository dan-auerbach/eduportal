"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/permissions";
import { getModuleProgress } from "@/lib/progress";
import { ModuleFeedbackSchema } from "@/lib/validators";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// Rate limiter — max 1 feedback per 60 seconds per user
// ---------------------------------------------------------------------------
const feedbackRateMap = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;

// ---------------------------------------------------------------------------
// submitModuleFeedback — upsert ModuleSelfAssessment
// ---------------------------------------------------------------------------
export async function submitModuleFeedback(
  moduleId: string,
  rating: number,
  suggestion: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await getTenantContext();

    // Validate input
    const parsed = ModuleFeedbackSchema.safeParse({ rating, suggestion });
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Neveljavni podatki" };
    }

    // Rate limit
    const key = `${ctx.user.id}:feedback`;
    const lastTime = feedbackRateMap.get(key) ?? 0;
    if (Date.now() - lastTime < RATE_LIMIT_MS) {
      return { success: false, error: "Počakajte minuto pred ponovnim oddajanjem ocene" };
    }

    // Verify module exists in tenant
    const module = await prisma.module.findUnique({
      where: { id: moduleId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!module) {
      return { success: false, error: "Znanje ne obstaja" };
    }

    // Verify module is completed (all sections done)
    const progress = await getModuleProgress(ctx.user.id, moduleId, ctx.tenantId);
    if (progress.completedSections < progress.totalSections) {
      return { success: false, error: "Znanje mora biti zaključeno pred oddajo ocene" };
    }

    // Upsert self assessment
    const assessment = await prisma.moduleSelfAssessment.upsert({
      where: {
        userId_moduleId: { userId: ctx.user.id, moduleId },
      },
      create: {
        userId: ctx.user.id,
        moduleId,
        tenantId: ctx.tenantId,
        rating: parsed.data.rating,
        note: parsed.data.suggestion,
      },
      update: {
        rating: parsed.data.rating,
        note: parsed.data.suggestion,
      },
    });

    feedbackRateMap.set(key, Date.now());

    return { success: true, data: { id: assessment.id } };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri oddaji ocene" };
  }
}
