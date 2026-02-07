import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTenant, getTenantMembers } from "@/actions/tenants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import Link from "next/link";
import { ArrowLeft, Building2, Users, BookOpen, Award } from "lucide-react";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { TenantEditForm } from "./tenant-edit-form";
import { MemberRoleSelect, RemoveMemberButton } from "./tenant-member-actions";
import { TenantPlanSelect } from "./tenant-plan-select";
import type { TenantTheme, TenantPlan, TenantRole } from "@/generated/prisma/client";

interface TenantDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const tenantResult = await getTenant(id);
  if (!tenantResult.success) {
    redirect("/owner");
  }

  const tenant = tenantResult.data as {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    theme: TenantTheme;
    plan: TenantPlan;
    createdAt: Date;
    archivedAt: Date | null;
    memberships: Array<{
      id: string;
      role: TenantRole;
      createdAt: Date;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        avatar: string | null;
        isActive: boolean;
      };
    }>;
    _count: {
      memberships: number;
      modules: number;
      groups: number;
      certificates: number;
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/owner">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("common.previous")}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          <p className="text-muted-foreground">/{tenant.slug}</p>
        </div>
        {tenant.archivedAt && (
          <Badge variant="destructive">{t("tenant.archivedLabel")}</Badge>
        )}
      </div>

      {/* Plan */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-sm font-medium">{t("plan.label")}</CardTitle>
            <CardDescription>{t("plan.currentPlan")}</CardDescription>
          </div>
          <Badge variant={tenant.plan === "PRO" ? "default" : tenant.plan === "STARTER" ? "outline" : "secondary"}>
            {t(`plan.${tenant.plan.toLowerCase()}`)}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <TenantPlanSelect tenantId={tenant.id} currentPlan={tenant.plan} />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("tenant.totalMembers")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant._count.memberships}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("tenant.totalModules")}</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant._count.modules}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("nav.groups")}</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant._count.groups}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("nav.certificates")}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenant._count.certificates}</div>
          </CardContent>
        </Card>
      </div>

      {/* Edit form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tenant.editTenant")}</CardTitle>
          <CardDescription>{t("tenant.settingsSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TenantEditForm
            tenantId={tenant.id}
            defaultValues={{
              name: tenant.name,
              slug: tenant.slug,
              logoUrl: tenant.logoUrl,
              theme: tenant.theme,
            }}
          />
        </CardContent>
      </Card>

      {/* Members table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tenant.members")}</CardTitle>
          <CardDescription>
            {tenant._count.memberships} {t("common.members")}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {tenant.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("common.noData")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.users.tableUser")}</TableHead>
                  <TableHead>{t("admin.users.tableEmail")}</TableHead>
                  <TableHead>{t("tenant.memberRole")}</TableHead>
                  <TableHead>{t("admin.users.tableStatus")}</TableHead>
                  <TableHead className="w-[50px]">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenant.memberships.map((membership) => (
                  <TableRow key={membership.id}>
                    <TableCell className="font-medium">
                      {membership.user.firstName} {membership.user.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {membership.user.email}
                    </TableCell>
                    <TableCell>
                      <MemberRoleSelect
                        tenantId={tenant.id}
                        userId={membership.user.id}
                        currentRole={membership.role}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={membership.user.isActive ? "default" : "secondary"}>
                        {membership.user.isActive
                          ? t("admin.users.statusActive")
                          : t("admin.users.statusInactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RemoveMemberButton
                        tenantId={tenant.id}
                        userId={membership.user.id}
                      />
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
