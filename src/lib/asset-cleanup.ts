/**
 * Centralized asset cleanup utilities.
 *
 * Provides functions to safely delete files from external providers
 * (Cloudflare Stream, Vercel Blob) and the abstract storage layer.
 * All functions are best-effort: provider errors are caught and returned,
 * never thrown — so callers can proceed with DB cleanup regardless.
 */

import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

// ── Types ──────────────────────────────────────────────────────────────

export interface CleanupResult {
  deletedMediaAssets: number;
  deletedAttachmentFiles: number;
  deletedCoverImages: number;
  errors: string[];
}

interface MediaAssetForCleanup {
  id: string;
  cfStreamUid: string | null;
  blobUrl: string | null;
  provider: string;
}

interface SectionForCleanup {
  id: string;
  cloudflareStreamUid: string | null;
  videoBlobUrl: string | null;
  mediaAssetId: string | null;
  mediaAsset: (MediaAssetForCleanup & {
    _count: { sections: number };
  }) | null;
  attachments: { storagePath: string }[];
}

// ── Provider cleanup ───────────────────────────────────────────────────

/**
 * Delete a MediaAsset's files from its provider (CF Stream / Vercel Blob).
 * Returns an error message on failure, or null on success.
 */
export async function cleanupMediaAssetProvider(
  asset: MediaAssetForCleanup,
): Promise<string | null> {
  try {
    // Cloudflare Stream video
    if (asset.cfStreamUid) {
      const { deleteCloudflareStreamVideo } = await import(
        "@/lib/cloudflare-stream"
      );
      await deleteCloudflareStreamVideo(asset.cfStreamUid);
    }

    // Vercel Blob document/file
    if (asset.blobUrl) {
      const { del } = await import("@vercel/blob");
      await del(asset.blobUrl);
    }

    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[asset-cleanup] Provider cleanup failed for asset ${asset.id}:`, msg);
    return `Asset ${asset.id}: ${msg}`;
  }
}

/**
 * Delete an attachment file from the storage abstraction layer.
 */
export async function cleanupAttachmentFile(
  storagePath: string,
): Promise<string | null> {
  try {
    await storage.delete(storagePath);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[asset-cleanup] Attachment delete failed (${storagePath}):`, msg);
    return `Attachment ${storagePath}: ${msg}`;
  }
}

/**
 * Delete a cover image from storage, but only if no other module uses the same URL.
 *
 * Module.coverImage stores a URL path like "/api/covers/hash.jpg".
 * The storage key is derived by stripping the "/api/" prefix → "covers/hash.jpg".
 */
export async function cleanupCoverImage(
  coverImageUrl: string,
  excludeModuleId: string,
): Promise<string | null> {
  try {
    // Check if any other module uses this cover image
    const otherCount = await prisma.module.count({
      where: {
        coverImage: coverImageUrl,
        id: { not: excludeModuleId },
      },
    });

    if (otherCount > 0) {
      // Still in use by another module — skip
      return null;
    }

    // Derive storage key: "/api/covers/hash.jpg" → "covers/hash.jpg"
    const storageKey = coverImageUrl.replace(/^\/api\//, "");
    if (!storageKey || storageKey === coverImageUrl) {
      // URL format doesn't match expected pattern — skip silently
      return null;
    }

    await storage.delete(storageKey);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[asset-cleanup] Cover image delete failed (${coverImageUrl}):`, msg);
    return `Cover ${coverImageUrl}: ${msg}`;
  }
}

// ── Section-level cleanup ──────────────────────────────────────────────

/**
 * Clean up all external files associated with a section:
 * - Attachment files in storage
 * - MediaAsset provider files (if orphaned after this section is deleted)
 * - Legacy cloudflareStreamUid / videoBlobUrl
 *
 * @param section - Section with loaded attachments and mediaAsset (with _count.sections)
 * @param options.deleteOrphanedMediaAssets - If true, delete MediaAsset DB record when orphaned
 */
export async function cleanupSectionAssets(
  section: SectionForCleanup,
  options: { deleteOrphanedMediaAssets?: boolean } = {},
): Promise<{ deletedMediaAssets: number; deletedAttachmentFiles: number; errors: string[] }> {
  const errors: string[] = [];
  let deletedMediaAssets = 0;
  let deletedAttachmentFiles = 0;

  // 1. Attachment files
  for (const att of section.attachments) {
    const err = await cleanupAttachmentFile(att.storagePath);
    if (err) errors.push(err);
    else deletedAttachmentFiles++;
  }

  // 2. MediaAsset (with reference count check)
  if (section.mediaAsset) {
    const asset = section.mediaAsset;
    const isLastReference = asset._count.sections <= 1;

    if (isLastReference) {
      // This section is the only (or last) user — clean up provider files
      const err = await cleanupMediaAssetProvider(asset);
      if (err) {
        errors.push(err);
        // Mark asset as DELETE_FAILED for visibility in audit
        try {
          await prisma.mediaAsset.update({
            where: { id: asset.id },
            data: { status: "DELETE_FAILED", lastError: err },
          });
        } catch {
          // Best effort
        }
      } else if (options.deleteOrphanedMediaAssets) {
        // Provider cleanup succeeded — delete DB record
        try {
          await prisma.mediaAsset.delete({ where: { id: asset.id } });
          deletedMediaAssets++;
        } catch {
          // May fail if cascade already deleted it
        }
      }
    }
    // If refCount > 1, the asset is used elsewhere — don't touch it
  }

  // 3. Legacy: direct cloudflareStreamUid on section (without MediaAsset)
  if (section.cloudflareStreamUid && !section.mediaAssetId) {
    try {
      const { deleteCloudflareStreamVideo } = await import(
        "@/lib/cloudflare-stream"
      );
      await deleteCloudflareStreamVideo(section.cloudflareStreamUid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Legacy CF video ${section.cloudflareStreamUid}: ${msg}`);
    }
  }

  // 4. Legacy: videoBlobUrl on section
  if (section.videoBlobUrl) {
    try {
      const { del } = await import("@vercel/blob");
      await del(section.videoBlobUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Legacy blob ${section.videoBlobUrl}: ${msg}`);
    }
  }

  return { deletedMediaAssets, deletedAttachmentFiles, errors };
}
