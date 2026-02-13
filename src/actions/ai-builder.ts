"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requirePermission, ForbiddenError } from "@/lib/permissions";
import { getTenantContext } from "@/lib/tenant";
import { rateLimitAiBuild } from "@/lib/rate-limit";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// startAiBuild - create a build record and fire off the async pipeline
// ---------------------------------------------------------------------------
export async function startAiBuild(params: {
  sourceType: "CF_STREAM_VIDEO" | "TEXT" | "FILE";
  mediaAssetId?: string;
  sourceText?: string;
  notes?: string;
}): Promise<ActionResult<{ buildId: string }>> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();
    await requirePermission(currentUser, "MANAGE_OWN_MODULES");

    // Rate limit
    const rl = await rateLimitAiBuild(currentUser.id);
    if (!rl.success) {
      return {
        success: false,
        error: "RATE_LIMIT",
      };
    }

    let cfVideoUid: string | null = null;
    let mediaAssetId: string | null = null;

    // Validate inputs
    if (params.sourceType === "CF_STREAM_VIDEO") {
      if (!params.mediaAssetId) {
        return { success: false, error: "Video je obvezen za ta vir." };
      }

      // Lookup cfStreamUid from MediaAsset
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: params.mediaAssetId, tenantId: ctx.tenantId },
        select: { cfStreamUid: true },
      });

      if (!asset?.cfStreamUid) {
        return { success: false, error: "Video ni bil najden ali ni pripravljen." };
      }

      cfVideoUid = asset.cfStreamUid;
      mediaAssetId = params.mediaAssetId;
    } else if (params.sourceType === "FILE") {
      if (!params.mediaAssetId) {
        return { success: false, error: "Datoteka je obvezna za ta vir." };
      }

      // Validate document asset exists and is ready
      const docAsset = await prisma.mediaAsset.findUnique({
        where: { id: params.mediaAssetId, tenantId: ctx.tenantId },
        select: { type: true, status: true, blobUrl: true },
      });

      if (!docAsset || docAsset.type !== "DOCUMENT") {
        return { success: false, error: "Dokument ni bil najden." };
      }

      if (docAsset.status !== "READY" || !docAsset.blobUrl) {
        return { success: false, error: "Dokument ni pripravljen." };
      }

      mediaAssetId = params.mediaAssetId;
    } else if (params.sourceType === "TEXT") {
      if (!params.sourceText?.trim()) {
        return { success: false, error: "Besedilo je obvezno za ta vir." };
      }
    }

    // Create build record
    const build = await prisma.aiModuleBuild.create({
      data: {
        tenantId: ctx.tenantId,
        createdById: currentUser.id,
        sourceType: params.sourceType,
        cfVideoUid,
        mediaAssetId,
        sourceText: params.sourceType === "TEXT" ? params.sourceText ?? null : null,
        language: ctx.tenantLocale ?? "sl",
        status: "QUEUED",
      },
    });

    // Return buildId — the client will trigger the pipeline via fetch
    return { success: true, data: { buildId: build.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri zagonu AI gradnje",
    };
  }
}

// ---------------------------------------------------------------------------
// getAiBuilds - list recent builds for current user + tenant
// ---------------------------------------------------------------------------
export async function getAiBuilds(): Promise<
  ActionResult<
    {
      id: string;
      sourceType: string;
      status: string;
      error: string | null;
      createdModuleId: string | null;
      createdAt: Date;
      moduleTitle: string | null;
    }[]
  >
> {
  try {
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    const builds = await prisma.aiModuleBuild.findMany({
      where: {
        tenantId: ctx.tenantId,
        createdById: currentUser.id,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        sourceType: true,
        status: true,
        error: true,
        createdModuleId: true,
        createdAt: true,
      },
    });

    // Fetch module titles for completed builds
    const moduleIds = builds
      .map((b) => b.createdModuleId)
      .filter((id): id is string => id !== null);

    const modules =
      moduleIds.length > 0
        ? await prisma.module.findMany({
            where: { id: { in: moduleIds } },
            select: { id: true, title: true },
          })
        : [];

    const titleMap = new Map(modules.map((m) => [m.id, m.title]));

    return {
      success: true,
      data: builds.map((b) => ({
        ...b,
        moduleTitle: b.createdModuleId
          ? titleMap.get(b.createdModuleId) ?? null
          : null,
      })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Napaka pri pridobivanju gradnje",
    };
  }
}
