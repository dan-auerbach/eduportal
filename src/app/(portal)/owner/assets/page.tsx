import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { AssetAuditList } from "./asset-audit-list";

export default async function OwnerAssetsPage() {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    redirect("/dashboard");
  }

  // Fetch all MediaAssets cross-tenant with usage count
  const assets = await prisma.mediaAsset.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      tenant: { select: { id: true, name: true } },
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
  });

  // Fetch tenant list for filter dropdown
  const tenants = await prisma.tenant.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const serialized = assets.map((a) => ({
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("owner.assetAudit")}</h1>
        <p className="text-muted-foreground">{t("owner.assetAuditSubtitle")}</p>
      </div>
      <AssetAuditList
        initialAssets={serialized}
        tenants={tenants}
      />
    </div>
  );
}
