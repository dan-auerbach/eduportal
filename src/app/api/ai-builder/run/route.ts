/**
 * AI Builder async pipeline route.
 *
 * Called fire-and-forget from the startAiBuild server action.
 * Runs the full pipeline: CF audio download → Soniox transcription → Claude → Module draft.
 * Long-running (up to 5 min).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getAudioDownloadUrl } from "@/lib/cloudflare-stream";
import { transcribeAudio } from "@/lib/soniox";
import { generateModuleDraft } from "@/lib/ai/generate-module-draft";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Prisma } from "@/generated/prisma/client";

export const maxDuration = 300; // 5 minutes

async function updateBuild(
  id: string,
  data: { status?: string; error?: string; sourceText?: string; aiStructured?: Prisma.InputJsonValue; createdModuleId?: string },
) {
  await prisma.aiModuleBuild.update({ where: { id }, data });
}

export async function POST(request: NextRequest) {
  // Auth via user session cookie (called directly from the browser)
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!["OWNER", "SUPER_ADMIN", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const buildId = searchParams.get("buildId");

  if (!buildId) {
    return NextResponse.json({ error: "buildId is required" }, { status: 400 });
  }

  const build = await prisma.aiModuleBuild.findUnique({ where: { id: buildId } });
  if (!build || build.createdById !== user.id) {
    return NextResponse.json({ error: "Build not found" }, { status: 404 });
  }

  if (build.status !== "QUEUED") {
    return NextResponse.json({ error: "Build already started" }, { status: 409 });
  }

  // Run the pipeline (don't await in response — but Vercel will keep function alive for maxDuration)
  try {
    let transcript = build.sourceText ?? "";

    // ── Step A: Get audio from CF Stream (if video source) ──────────
    if (build.sourceType === "CF_STREAM_VIDEO" && build.cfVideoUid) {
      await updateBuild(buildId, { status: "TRANSCRIBING" });

      console.log(`[ai-builder] Getting audio download URL for ${build.cfVideoUid}`);
      const audioUrl = await getAudioDownloadUrl(build.cfVideoUid);
      console.log(`[ai-builder] Audio URL ready: ${audioUrl.slice(0, 80)}...`);

      // ── Step B: Transcribe with Soniox ──────────────────────────────
      console.log(`[ai-builder] Starting Soniox transcription (lang: ${build.language})`);
      transcript = await transcribeAudio(audioUrl, build.language);
      console.log(`[ai-builder] Transcript ready: ${transcript.length} chars`);

      // Save transcript
      await updateBuild(buildId, { sourceText: transcript });
    }

    if (!transcript.trim()) {
      throw new Error("No source text available for module generation");
    }

    // ── Step C: Generate module with Claude ────────────────────────────
    await updateBuild(buildId, { status: "GENERATING" });

    console.log(`[ai-builder] Generating module draft with Claude...`);
    const aiOutput = await generateModuleDraft({
      sourceText: transcript,
      language: build.language as "sl" | "en",
    });

    // Save AI output
    await updateBuild(buildId, { aiStructured: aiOutput as unknown as Prisma.InputJsonValue });

    // ── Step D: Create Module draft in DB ──────────────────────────────
    console.log(`[ai-builder] Creating module draft: "${aiOutput.title}"`);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create module
      const module = await tx.module.create({
        data: {
          title: aiOutput.title,
          description: aiOutput.description,
          status: "DRAFT",
          tenantId: build.tenantId,
          createdById: build.createdById,
        },
      });

      // 2. Create sections
      // First section: Key Takeaways
      const takeawaysHtml = `<h3>${build.language === "sl" ? "Ključne ugotovitve" : "Key Takeaways"}</h3><ul>${aiOutput.keyTakeaways.map((t) => `<li>${sanitizeHtml(t)}</li>`).join("")}</ul>`;

      await tx.section.create({
        data: {
          moduleId: module.id,
          tenantId: build.tenantId,
          title: build.language === "sl" ? "Ključne ugotovitve" : "Key Takeaways",
          content: takeawaysHtml,
          type: "TEXT",
          sortOrder: 0,
        },
      });

      // Content sections
      for (let i = 0; i < aiOutput.sections.length; i++) {
        const section = aiOutput.sections[i];
        await tx.section.create({
          data: {
            moduleId: module.id,
            tenantId: build.tenantId,
            title: section.title,
            content: sanitizeHtml(section.content),
            type: "TEXT",
            sortOrder: i + 1,
          },
        });
      }

      // 3. Create quiz
      const quiz = await tx.quiz.create({
        data: {
          moduleId: module.id,
          tenantId: build.tenantId,
          title: build.language === "sl" ? "Preverjanje znanja" : "Knowledge Check",
          passingScore: 70,
          maxAttempts: 3,
          sortOrder: 0,
        },
      });

      // 4. Create quiz questions
      for (let i = 0; i < aiOutput.quiz.questions.length; i++) {
        const q = aiOutput.quiz.questions[i];
        const correctCount = q.options.filter((o) => o.isCorrect).length;
        await tx.quizQuestion.create({
          data: {
            quizId: quiz.id,
            tenantId: build.tenantId,
            question: q.question,
            options: q.options,
            type: correctCount > 1 ? "MULTIPLE_CHOICE" : "SINGLE_CHOICE",
            sortOrder: i,
          },
        });
      }

      return module;
    });

    // ── Done ──────────────────────────────────────────────────────────
    await updateBuild(buildId, {
      status: "DONE",
      createdModuleId: result.id,
    });

    console.log(`[ai-builder] Build complete! Module ID: ${result.id}`);

    return NextResponse.json({ success: true, moduleId: result.id });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[ai-builder] Build failed:`, errorMsg);

    await updateBuild(buildId, {
      status: "FAILED",
      error: errorMsg,
    });

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
