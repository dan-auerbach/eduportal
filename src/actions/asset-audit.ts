"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { cleanupMediaAssetProvider } from "@/lib/asset-cleanup";
import type { ActionResult } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────

export interface AssetAuditItem {
  id: string;
  tenantId: string;
  tenantName: string;
  type: string;
  status: string;
  provider: string;
  title: string;
  cfStreamUid: string | null;
  blobUrl: string | null;
  mimeType: string | null;
  sizeBytes: string | null; // BigInt serialized as string
  durationSeconds: number | null;
  createdAt: string;
  createdByName: string;
  usageCount: number;
  lastError: string | null;
  // Top section references
  sections: { id: string; title: string; moduleTitle: string }[];
}

export interface AssetAuditFilters {
  tenantId?: string;
  type?: string;
  provider?: string;
  status?: string;
  orphanedOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface AssetAuditResult {
  items: AssetAuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function requireOwner(role: string) {
  if (role !== "OWNER") {
    throw new ForbiddenError("Only OWNER can access asset audit");
  }
}

// ── getAssetAuditData ──────────────────────────────────────────────────

export async function getAssetAuditData(
  filters: AssetAuditFilters = {},
): Promise<ActionResult<AssetAuditResult>> {
  try {
    const user = await getCurrentUser();
    requireOwner(user.role);

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.type) where.type = filters.type;
    if (filters.provider) where.provider = filters.provider;
    if (filters.status) where.status = filters.status;
    if (filters.search) {
      where.title = { contains: filters.search, mode: "insensitive" };
    }

    // Fetch assets with usage count and section references
    const [assets, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: { select: { name: true } },
          createdBy: { select: { firstName: true, lastName: true } },
          sections: {
            take: 5,
            select: {
              id: true,
              title: true,
              module: { select: { title: true } },
            },
          },
          _count: { select: { sections: true } },
        },
      }),
      prisma.mediaAsset.count({ where }),
    ]);

    // If orphanedOnly, filter to usage count 0
    let filteredAssets = assets;
    let filteredTotal = total;
    if (filters.orphanedOnly) {
      filteredAssets = assets.filter((a) => a._count.sections === 0);
      // For accurate total with orphan filter, we need a separate count
      // This is acceptable for MVP — for large datasets, use raw SQL
      if (filteredAssets.length < pageSize && page === 1) {
        filteredTotal = filteredAssets.length;
      }
    }

    const items: AssetAuditItem[] = filteredAssets.map((a) => ({
      id: a.id,
      tenantId: a.tenantId,
      tenantName: a.tenant.name,
      type: a.type,
      status: a.status,
      provider: a.provider,
      title: a.title,
      cfStreamUid: a.cfStreamUid,
      blobUrl: a.blobUrl,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes?.toString() ?? null,
      durationSeconds: a.durationSeconds,
      createdAt: a.createdAt.toISOString(),
      createdByName: `${a.createdBy.firstName} ${a.createdBy.lastName}`,
      usageCount: a._count.sections,
      lastError: a.lastError,
      sections: a.sections.map((s) => ({
        id: s.id,
        title: s.title,
        moduleTitle: s.module.title,
      })),
    }));

    return {
      success: true,
      data: { items, total: filteredTotal, page, pageSize },
    };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Error loading assets",
    };
  }
}

// ── getTenantList (for filter dropdown) ────────────────────────────────

export async function getAuditTenantList(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    const user = await getCurrentUser();
    requireOwner(user.role);

    const tenants = await prisma.tenant.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return { success: true, data: tenants };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: "Error loading tenants" };
  }
}

// ── bulkDeleteOrphanedAssets ───────────────────────────────────────────

export async function bulkDeleteOrphanedAssets(
  assetIds: string[],
): Promise<
  ActionResult<{ deleted: number; failed: number; skipped: number; errors: string[] }>
> {
  try {
    const user = await getCurrentUser();
    requireOwner(user.role);

    if (assetIds.length === 0) {
      return { success: true, data: { deleted: 0, failed: 0, skipped: 0, errors: [] } };
    }

    // Cap at 50 per request to stay within serverless timeout
    const ids = assetIds.slice(0, 50);
    let deleted = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const assetId of ids) {
      // Re-check usage count (may have changed since UI loaded)
      const asset = await prisma.mediaAsset.findUnique({
        where: { id: assetId },
        include: { _count: { select: { sections: true } } },
      });

      if (!asset) {
        skipped++;
        continue;
      }

      if (asset._count.sections > 0) {
        skipped++;
        errors.push(`Asset ${asset.title} (${assetId}) is still in use by ${asset._count.sections} section(s)`);
        continue;
      }

      // Mark as DELETE_PENDING
      await prisma.mediaAsset.update({
        where: { id: assetId },
        data: { status: "DELETE_PENDING" },
      });

      // Attempt provider cleanup
      const err = await cleanupMediaAssetProvider({
        id: asset.id,
        cfStreamUid: asset.cfStreamUid,
        blobUrl: asset.blobUrl,
        provider: asset.provider,
      });

      if (err) {
        failed++;
        errors.push(err);
        // Mark as DELETE_FAILED
        await prisma.mediaAsset.update({
          where: { id: assetId },
          data: { status: "DELETE_FAILED", lastError: err },
        });
      } else {
        // Provider cleanup succeeded — delete DB record
        await prisma.mediaAsset.delete({ where: { id: assetId } });
        deleted++;
      }
    }

    // Audit log
    await logAudit({
      actorId: user.id,
      action: "ASSET_BULK_DELETED",
      entityType: "MediaAsset",
      entityId: "bulk",
      tenantId: "system",
      metadata: {
        requested: ids.length,
        deleted,
        failed,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      },
    });

    return {
      success: true,
      data: { deleted, failed, skipped, errors },
    };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Error deleting assets",
    };
  }
}

// ── forceDeleteAsset ───────────────────────────────────────────────────

export async function forceDeleteAsset(
  assetId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await getCurrentUser();
    requireOwner(user.role);

    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: { _count: { select: { sections: true } } },
    });

    if (!asset) {
      return { success: false, error: "Asset not found" };
    }

    // Disconnect all section references first
    if (asset._count.sections > 0) {
      await prisma.section.updateMany({
        where: { mediaAssetId: assetId },
        data: { mediaAssetId: null },
      });
    }

    // Mark as DELETE_PENDING
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: "DELETE_PENDING" },
    });

    // Attempt provider cleanup
    const err = await cleanupMediaAssetProvider({
      id: asset.id,
      cfStreamUid: asset.cfStreamUid,
      blobUrl: asset.blobUrl,
      provider: asset.provider,
    });

    if (err) {
      await prisma.mediaAsset.update({
        where: { id: assetId },
        data: { status: "DELETE_FAILED", lastError: err },
      });
      return { success: false, error: `Provider cleanup failed: ${err}` };
    }

    // Delete DB record
    await prisma.mediaAsset.delete({ where: { id: assetId } });

    await logAudit({
      actorId: user.id,
      action: "MEDIA_DELETED",
      entityType: "MediaAsset",
      entityId: assetId,
      tenantId: asset.tenantId,
      metadata: {
        title: asset.title,
        forced: true,
        disconnectedSections: asset._count.sections,
      },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }
    return {
      success: false,
      error: e instanceof Error ? e.message : "Error deleting asset",
    };
  }
}
