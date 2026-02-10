import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { getPlanLimits } from "@/lib/plan";
import { Button } from "@/components/ui/button";
import { CreateUserDialog } from "@/components/admin/user-form";
import { UserSearch } from "./user-search";
import { UsersTableWithBulkActions } from "./users-table-bulk";
import { t } from "@/lib/i18n";
import { Plus } from "lucide-react";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_USERS", { tenantId: ctx.tenantId });

  const params = await searchParams;
  const search = params.q || "";

  // Query users via memberships in tenant
  const searchFilter = search
    ? {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [activeUsers, deactivatedUsers, memberCount] = await Promise.all([
    prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        memberships: { some: { tenantId: ctx.tenantId } },
        ...searchFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        groups: {
          where: { group: { tenantId: ctx.tenantId } },
          include: {
            group: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        isActive: false,
        memberships: { some: { tenantId: ctx.tenantId } },
        ...searchFilter,
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        groups: {
          where: { group: { tenantId: ctx.tenantId } },
          include: {
            group: { select: { id: true, name: true, color: true } },
          },
        },
      },
    }),
    prisma.membership.count({ where: { tenantId: ctx.tenantId } }),
  ]);

  // ── Usage stats batch query (no N+1) ─────────────────────────
  const activeUserIds = activeUsers.map((u) => u.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [usage30d, lastSeenRaw] = activeUserIds.length > 0
    ? await Promise.all([
        // 30-day stats: total seconds + session count
        prisma.userSession.groupBy({
          by: ["userId"],
          where: {
            tenantId: ctx.tenantId,
            userId: { in: activeUserIds },
            startedAt: { gte: thirtyDaysAgo },
          },
          _sum: { durationSeconds: true },
          _count: { id: true },
        }),
        // All-time last seen
        prisma.userSession.groupBy({
          by: ["userId"],
          where: {
            tenantId: ctx.tenantId,
            userId: { in: activeUserIds },
          },
          _max: { lastPingAt: true },
        }),
      ])
    : [[], []];

  // Build lookup map (serializable for client component)
  const usageMap: Record<string, { seconds30d: number; sessions30d: number; lastSeenAt: string | null }> = {};

  for (const row of usage30d) {
    usageMap[row.userId] = {
      seconds30d: row._sum.durationSeconds ?? 0,
      sessions30d: row._count.id,
      lastSeenAt: null,
    };
  }
  for (const row of lastSeenRaw) {
    const existing = usageMap[row.userId];
    if (existing) {
      existing.lastSeenAt = row._max.lastPingAt?.toISOString() ?? null;
    } else {
      usageMap[row.userId] = {
        seconds30d: 0,
        sessions30d: 0,
        lastSeenAt: row._max.lastPingAt?.toISOString() ?? null,
      };
    }
  }

  const limits = getPlanLimits(ctx.tenantPlan);
  const userLimitReached = limits.maxUsers !== null && memberCount >= limits.maxUsers;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.users.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.users.subtitle")}
          </p>
        </div>
        {userLimitReached ? (
          <div className="flex flex-col items-end gap-1">
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              {t("admin.users.createUser")}
            </Button>
            <p className="text-xs text-muted-foreground max-w-[250px] text-right">
              {t("limit.users")}
            </p>
          </div>
        ) : (
          <CreateUserDialog />
        )}
      </div>
      {userLimitReached && (
        <div className="rounded-md border border-muted bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("upgrade.usersHint")} {t("upgrade.info")}
          </p>
        </div>
      )}

      <UserSearch defaultValue={search} />

      <UsersTableWithBulkActions
        activeUsers={activeUsers}
        deactivatedUsers={deactivatedUsers}
        usageMap={usageMap}
        isOwner={ctx.effectiveRole === "OWNER"}
      />
    </div>
  );
}
