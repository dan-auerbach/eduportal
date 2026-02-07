import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { getPlanLimits } from "@/lib/plan";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { CreateUserDialog } from "@/components/admin/user-form";
import { UserSearch } from "./user-search";
import { UserActions } from "./user-actions";
import { t } from "@/lib/i18n";
import { Plus } from "lucide-react";
import { formatDuration } from "@/lib/utils";
import type { Role } from "@/generated/prisma/client";

const roleBadgeVariant: Record<Role, string> = {
  OWNER: "bg-purple-100 text-purple-800 border-purple-200",
  SUPER_ADMIN: "bg-red-100 text-red-800 border-red-200",
  ADMIN: "bg-blue-100 text-blue-800 border-blue-200",
  EMPLOYEE: "bg-gray-100 text-gray-800 border-gray-200",
};

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

  const [users, memberCount] = await Promise.all([
    prisma.user.findMany({
      where: {
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
    prisma.membership.count({ where: { tenantId: ctx.tenantId } }),
  ]);

  // ── Usage stats batch query (no N+1) ─────────────────────────────
  const userIds = users.map((u) => u.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [usage30d, lastSeenRaw] = userIds.length > 0
    ? await Promise.all([
        // 30-day stats: total seconds + session count
        prisma.userSession.groupBy({
          by: ["userId"],
          where: {
            tenantId: ctx.tenantId,
            userId: { in: userIds },
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
            userId: { in: userIds },
          },
          _max: { lastPingAt: true },
        }),
      ])
    : [[], []];

  // Build lookup maps
  const usageMap = new Map<string, { seconds30d: number; sessions30d: number; lastSeenAt: Date | null }>();

  for (const row of usage30d) {
    usageMap.set(row.userId, {
      seconds30d: row._sum.durationSeconds ?? 0,
      sessions30d: row._count.id,
      lastSeenAt: null,
    });
  }
  for (const row of lastSeenRaw) {
    const existing = usageMap.get(row.userId);
    if (existing) {
      existing.lastSeenAt = row._max.lastPingAt;
    } else {
      usageMap.set(row.userId, {
        seconds30d: 0,
        sessions30d: 0,
        lastSeenAt: row._max.lastPingAt,
      });
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

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.users.tableUser")}</TableHead>
              <TableHead>{t("admin.users.tableEmail")}</TableHead>
              <TableHead>{t("admin.users.tableRole")}</TableHead>
              <TableHead>{t("admin.users.tableStatus")}</TableHead>
              <TableHead>{t("admin.users.tableGroups")}</TableHead>
              <TableHead>{t("admin.users.tableLastLogin")}</TableHead>
              <TableHead>{t("admin.users.usage30d")}</TableHead>
              <TableHead>{t("admin.users.visits30d")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  {t("admin.users.noUsersFound")}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const initials = `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
                const usage = usageMap.get(user.id);
                const lastSeenAt = usage?.lastSeenAt;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {user.firstName} {user.lastName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={roleBadgeVariant[user.role]}
                      >
                        {t(`roles.${user.role}`)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.isActive ? "default" : "secondary"}
                      >
                        {user.isActive ? t("admin.users.statusActive") : t("admin.users.statusInactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.groups.length === 0 ? (
                          <span className="text-xs text-muted-foreground">{t("admin.users.noGroups")}</span>
                        ) : (
                          user.groups.map((ug) => (
                            <Badge
                              key={ug.groupId}
                              variant="outline"
                              className="text-xs"
                              style={
                                ug.group.color
                                  ? {
                                      borderColor: ug.group.color,
                                      color: ug.group.color,
                                    }
                                  : undefined
                              }
                            >
                              {ug.group.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>
                        <span className="text-muted-foreground">
                          {user.lastLoginAt
                            ? format(new Date(user.lastLoginAt), "d. MMM yyyy, HH:mm", { locale: getDateLocale() })
                            : t("common.never")}
                        </span>
                        {lastSeenAt && (
                          <p className="text-xs text-muted-foreground/70">
                            {t("admin.users.lastActivity")}: {format(new Date(lastSeenAt), "d. MMM, HH:mm", { locale: getDateLocale() })}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(usage?.seconds30d ?? 0)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {usage?.sessions30d ?? "—"}
                    </TableCell>
                    <TableCell>
                      <UserActions userId={user.id} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
