"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { deleteCloudflareStreamVideo } from "@/lib/cloudflare-stream";
import { t, setLocale } from "@/lib/i18n";
import type { ActionResult } from "@/types";

// ---------------------------------------------------------------------------
// getMediaAssets — list all video assets for the current tenant
// ---------------------------------------------------------------------------
export async function getMediaAssets(): Promise<
  ActionResult<
    {
      id: string;
      title: string;
      status: string;
      cfStreamUid: string | null;
      durationSeconds: number | null;
      createdAt: Date;
      createdBy: { firstName: string; lastName: string };
      _count: { sections: number };
    }[]
  >
> {
  try {
    const ctx = await getTenantContext();
    setLocale(ctx.tenantLocale);

    const assets = await prisma.mediaAsset.findMany({
      where: { tenantId: ctx.tenantId, type: "VIDEO" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        cfStreamUid: true,
        durationSeconds: true,
        createdAt: true,
        createdBy: { select: { firstName: true, lastName: true } },
        _count: { select: { sections: true } },
      },
    });

    return { success: true, data: assets };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// createMediaAsset — create a new MediaAsset placeholder (before TUS upload)
// ---------------------------------------------------------------------------
export async function createMediaAsset(
  title: string,
): Promise<ActionResult<{ assetId: string }>> {
  try {
    const user = await getCurrentUser();
    const ctx = await getTenantContext();
    setLocale(ctx.tenantLocale);

    if (!["OWNER", "SUPER_ADMIN", "ADMIN"].includes(user.role)) {
      return { success: false, error: t("media.forbidden") };
    }

    const cleanTitle = title.trim() || "Video";

    const asset = await prisma.mediaAsset.create({
      data: {
        tenantId: ctx.tenantId,
        createdById: user.id,
        type: "VIDEO",
        status: "PROCESSING",
        provider: "CLOUDFLARE_STREAM",
        title: cleanTitle,
      },
    });

    return { success: true, data: { assetId: asset.id } };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// renameMediaAsset — change the title of a media asset
// ---------------------------------------------------------------------------
export async function renameMediaAsset(
  assetId: string,
  title: string,
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    const ctx = await getTenantContext();
    setLocale(ctx.tenantLocale);

    if (!["OWNER", "SUPER_ADMIN", "ADMIN"].includes(user.role)) {
      return { success: false, error: t("media.forbidden") };
    }

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      return { success: false, error: t("media.titleRequired") };
    }

    await prisma.mediaAsset.update({
      where: { id: assetId, tenantId: ctx.tenantId },
      data: { title: cleanTitle },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}

// ---------------------------------------------------------------------------
// deleteMediaAsset — hard delete (OWNER only, blocked if in use)
// ---------------------------------------------------------------------------
export async function deleteMediaAsset(
  assetId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    const ctx = await getTenantContext();
    setLocale(ctx.tenantLocale);

    // OWNER only
    if (user.role !== "OWNER") {
      return { success: false, error: t("media.ownerOnly") };
    }

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId, tenantId: ctx.tenantId },
      include: { _count: { select: { sections: true } } },
    });

    if (!asset) {
      return { success: false, error: t("media.notFound") };
    }

    // Block if in use
    if (asset._count.sections > 0) {
      return {
        success: false,
        error: t("media.cannotDelete"),
      };
    }

    // Delete from Cloudflare Stream
    if (asset.cfStreamUid) {
      try {
        await deleteCloudflareStreamVideo(asset.cfStreamUid);
      } catch (err) {
        console.error("[media] CF Stream delete error:", err);
        // Continue with DB delete even if CF fails
      }
    }

    // Delete from DB
    await prisma.mediaAsset.delete({ where: { id: assetId } });

    // Audit log
    await logAudit({
      actorId: user.id,
      tenantId: ctx.tenantId,
      action: "MEDIA_DELETED",
      entityType: "MediaAsset",
      entityId: assetId,
      metadata: { title: asset.title, cfStreamUid: asset.cfStreamUid },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Error" };
  }
}
