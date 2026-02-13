import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { t } from "@/lib/i18n";
import { AiBuilderForm } from "./ai-builder-form";

export default async function AiBuilderPage() {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_OWN_MODULES");

  // Get all READY video assets from Media Library
  const videoAssets = await prisma.mediaAsset.findMany({
    where: {
      tenantId: ctx.tenantId,
      type: "VIDEO",
      status: "READY",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      cfStreamUid: true,
    },
  });

  const videos = videoAssets
    .filter((a) => a.cfStreamUid)
    .map((a) => ({
      id: a.id,
      label: a.title,
    }));

  // Get recent builds
  const recentBuilds = await prisma.aiModuleBuild.findMany({
    where: {
      tenantId: ctx.tenantId,
      createdById: ctx.user.id,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      sourceType: true,
      status: true,
      error: true,
      createdModuleId: true,
      createdAt: true,
    },
  });

  // Get module titles for completed builds
  const moduleIds = recentBuilds
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

  const buildsWithTitles = recentBuilds.map((b) => ({
    ...b,
    createdAt: b.createdAt.toISOString(),
    moduleTitle: b.createdModuleId
      ? titleMap.get(b.createdModuleId) ?? null
      : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("aiBuilder.title")}
        </h1>
        <p className="text-muted-foreground">{t("aiBuilder.subtitle")}</p>
      </div>

      <AiBuilderForm videos={videos} recentBuilds={buildsWithTitles} />
    </div>
  );
}
