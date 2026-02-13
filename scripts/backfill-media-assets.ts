/**
 * Backfill script: migrate legacy cloudflareStreamUid → MediaAsset.
 *
 * Finds all Sections with a cloudflareStreamUid but no mediaAssetId,
 * upserts a MediaAsset for each (tenantId, cfStreamUid) pair,
 * and links the section to it.
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-media-assets.ts
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("[backfill] Starting MediaAsset backfill...");

  // Find all sections with a CF Stream UID but no mediaAssetId
  const sections = await prisma.section.findMany({
    where: {
      cloudflareStreamUid: { not: null },
      mediaAssetId: null,
    },
    select: {
      id: true,
      tenantId: true,
      cloudflareStreamUid: true,
      title: true,
      moduleId: true,
      module: { select: { createdById: true } },
    },
  });

  console.log(`[backfill] Found ${sections.length} sections to migrate.`);

  if (sections.length === 0) {
    console.log("[backfill] Nothing to do.");
    return;
  }

  // Group by (tenantId, cfStreamUid) to avoid duplicate MediaAssets
  const assetMap = new Map<string, { tenantId: string; cfStreamUid: string; createdById: string; title: string; sectionIds: string[] }>();

  for (const section of sections) {
    const cfUid = section.cloudflareStreamUid!;
    const key = `${section.tenantId}:${cfUid}`;

    if (!assetMap.has(key)) {
      assetMap.set(key, {
        tenantId: section.tenantId,
        cfStreamUid: cfUid,
        createdById: section.module.createdById,
        title: section.title || "Video",
        sectionIds: [],
      });
    }

    assetMap.get(key)!.sectionIds.push(section.id);
  }

  console.log(`[backfill] ${assetMap.size} unique (tenant, cfStreamUid) pairs.`);

  let created = 0;
  let linked = 0;

  for (const [, entry] of assetMap) {
    // Upsert MediaAsset (unique on tenantId + cfStreamUid)
    const asset = await prisma.mediaAsset.upsert({
      where: {
        tenantId_cfStreamUid: {
          tenantId: entry.tenantId,
          cfStreamUid: entry.cfStreamUid,
        },
      },
      create: {
        tenantId: entry.tenantId,
        createdById: entry.createdById,
        type: "VIDEO",
        status: "READY",
        provider: "CLOUDFLARE_STREAM",
        title: entry.title,
        cfStreamUid: entry.cfStreamUid,
      },
      update: {}, // No updates if already exists
    });

    created++;

    // Link sections to this MediaAsset
    await prisma.section.updateMany({
      where: {
        id: { in: entry.sectionIds },
      },
      data: {
        mediaAssetId: asset.id,
      },
    });

    linked += entry.sectionIds.length;

    console.log(
      `[backfill] Asset ${asset.id} (${entry.cfStreamUid.slice(0, 8)}...) → ${entry.sectionIds.length} sections`,
    );
  }

  console.log(`[backfill] Done! Created/found ${created} MediaAssets, linked ${linked} sections.`);
}

main()
  .catch((err) => {
    console.error("[backfill] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
