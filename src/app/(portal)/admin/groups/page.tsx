import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen } from "lucide-react";
import Link from "next/link";
import { CreateGroupDialog } from "@/components/admin/group-form";
import { t } from "@/lib/i18n";

export default async function AdminGroupsPage() {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_GROUPS", { tenantId: ctx.tenantId });

  const groups = await prisma.group.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { users: true, modules: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("admin.groups.title")}</h1>
          <p className="text-muted-foreground">
            {t("admin.groups.subtitle")}
          </p>
        </div>
        <CreateGroupDialog />
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">{t("admin.groups.noGroups")}</p>
            <p className="text-sm text-muted-foreground">
              {t("admin.groups.createFirst")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link key={group.id} href={`/admin/groups/${group.id}`}>
              <Card className="cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    {group.color && (
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {group.description && (
                    <p className="mb-3 text-sm text-muted-foreground line-clamp-2">
                      {group.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" />
                      {group._count.users} {t("common.members")}
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <BookOpen className="h-3 w-3" />
                      {group._count.modules} {t("common.modules")}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
