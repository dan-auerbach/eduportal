import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { MediaList } from "./media-list";

export default async function AdminMediaPage() {
  const ctx = await getTenantContext();

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

  const serialized = assets.map((a) => ({
    id: a.id,
    title: a.title,
    status: a.status,
    cfStreamUid: a.cfStreamUid,
    durationSeconds: a.durationSeconds,
    createdAt: a.createdAt.toISOString(),
    author: `${a.createdBy.firstName} ${a.createdBy.lastName}`,
    usageCount: a._count.sections,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("media.title")}</h1>
        <p className="text-muted-foreground">{t("media.subtitle")}</p>
      </div>
      <MediaList
        initialAssets={serialized}
        userRole={ctx.user.role}
      />
    </div>
  );
}
