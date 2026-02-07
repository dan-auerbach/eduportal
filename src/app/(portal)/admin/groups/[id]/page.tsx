import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Users, BookOpen } from "lucide-react";
import Link from "next/link";
import { GroupEditForm } from "./group-edit-form";
import { GroupMembers } from "./group-members";
import { t } from "@/lib/i18n";

export default async function AdminGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_GROUPS", { tenantId: ctx.tenantId });

  const { id } = await params;

  // Verify group belongs to tenant
  const group = await prisma.group.findUnique({
    where: { id, tenantId: ctx.tenantId },
    include: {
      users: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              isActive: true,
              avatar: true,
            },
          },
        },
      },
      modules: {
        include: {
          module: {
            select: {
              id: true,
              title: true,
              status: true,
              difficulty: true,
            },
          },
        },
      },
    },
  });

  if (!group) {
    notFound();
  }

  // Get all users in tenant for add member functionality (capped at 500)
  const allUsers = await prisma.user.findMany({
    where: { deletedAt: null, isActive: true, memberships: { some: { tenantId: ctx.tenantId } } },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { firstName: "asc" },
    take: 500,
  });

  const memberIds = new Set(group.users.map((u) => u.userId));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/groups">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          {group.color && (
            <div
              className="h-6 w-6 rounded-full"
              style={{ backgroundColor: group.color }}
            />
          )}
          <div>
            <h1 className="text-2xl font-bold">{group.name}</h1>
            <p className="text-muted-foreground">
              {group.description || t("admin.groups.noDescription")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit Group */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.groups.groupDetails")}</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupEditForm
              groupId={group.id}
              groupName={group.name}
              defaultValues={{
                name: group.name,
                description: group.description || "",
                color: group.color || "#6366f1",
              }}
            />
          </CardContent>
        </Card>

        {/* Group stats */}
        <Card>
          <CardHeader>
            <CardTitle>{t("admin.groups.overview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">{group.users.length} {t("admin.groups.groupMembers")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.groups.activeMembers")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {group.modules.length} {t("admin.groups.assignedModules")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("admin.groups.assignedModulesDesc")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t("admin.groups.groupMembers")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GroupMembers
            groupId={group.id}
            members={group.users.map((u) => u.user)}
            availableUsers={availableUsers}
          />
        </CardContent>
      </Card>

      {/* Assigned Modules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            {t("admin.groups.assignedModules")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {group.modules.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.groups.noModulesAssigned")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.groups.module")}</TableHead>
                  <TableHead>{t("admin.users.tableStatus")}</TableHead>
                  <TableHead>{t("admin.groups.difficulty")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.modules.map((mg) => (
                  <TableRow key={mg.moduleId}>
                    <TableCell>
                      <Link
                        href={`/admin/modules/${mg.moduleId}/edit`}
                        className="font-medium hover:underline"
                      >
                        {mg.module.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{t(`moduleStatus.${mg.module.status}`)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(`difficulty.${mg.module.difficulty}`)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
