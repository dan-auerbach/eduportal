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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { ModuleActions } from "./module-actions";
import { t } from "@/lib/i18n";
import type { ModuleStatus, Difficulty } from "@/generated/prisma/client";

const statusBadgeVariant: Record<ModuleStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800 border-yellow-200",
  PUBLISHED: "bg-green-100 text-green-800 border-green-200",
  ARCHIVED: "bg-gray-100 text-gray-800 border-gray-200",
};

const difficultyBadgeVariant: Record<Difficulty, string> = {
  BEGINNER: "bg-emerald-100 text-emerald-800 border-emerald-200",
  INTERMEDIATE: "bg-amber-100 text-amber-800 border-amber-200",
  ADVANCED: "bg-red-100 text-red-800 border-red-200",
};

export default async function AdminModulesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_ALL_MODULES", { tenantId: ctx.tenantId }, {
    permission: "MANAGE_OWN_MODULES",
    check: true,
  });

  const params = await searchParams;
  const activeTab = params.tab || "ALL";

  const where =
    activeTab !== "ALL"
      ? { status: activeTab as ModuleStatus, tenantId: ctx.tenantId }
      : { tenantId: ctx.tenantId };

  const [modules, moduleCount, companyPins] = await Promise.all([
    prisma.module.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        category: {
          select: { id: true, name: true },
        },
        _count: { select: { sections: true, groups: true } },
      },
    }),
    prisma.module.count({ where: { tenantId: ctx.tenantId } }),
    prisma.companyPinnedModule.findMany({
      where: { tenantId: ctx.tenantId },
      select: { moduleId: true },
    }),
  ]);

  const companyPinSet = new Set(companyPins.map((p) => p.moduleId));

  const limits = getPlanLimits(ctx.tenantPlan);
  const moduleLimitReached = limits.maxModules !== null && moduleCount >= limits.maxModules;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{t("admin.modules.title")}</h1>
            {limits.maxModules !== null && (
              <Badge variant={moduleLimitReached ? "secondary" : "outline"} className="text-xs">
                {moduleCount} / {limits.maxModules}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">
            {t("admin.modules.subtitle")}
          </p>
        </div>
        {moduleLimitReached ? (
          <div className="flex flex-col items-end gap-1">
            <Button disabled>
              <Plus className="mr-2 h-4 w-4" />
              {t("admin.modules.createModule")}
            </Button>
            <p className="text-xs text-muted-foreground max-w-[250px] text-right">
              {t("limit.modules")}
            </p>
          </div>
        ) : (
          <Button asChild>
            <Link href="/admin/modules/new/edit">
              <Plus className="mr-2 h-4 w-4" />
              {t("admin.modules.createModule")}
            </Link>
          </Button>
        )}
      </div>
      {moduleLimitReached && (
        <div className="rounded-md border border-muted bg-muted/30 px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {t("upgrade.modulesHint")} {t("upgrade.info")}
          </p>
        </div>
      )}

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="ALL" asChild>
            <Link href="/admin/modules?tab=ALL">{t("admin.modules.tabAll")}</Link>
          </TabsTrigger>
          <TabsTrigger value="DRAFT" asChild>
            <Link href="/admin/modules?tab=DRAFT">{t("admin.modules.tabDraft")}</Link>
          </TabsTrigger>
          <TabsTrigger value="PUBLISHED" asChild>
            <Link href="/admin/modules?tab=PUBLISHED">{t("admin.modules.tabPublished")}</Link>
          </TabsTrigger>
          <TabsTrigger value="ARCHIVED" asChild>
            <Link href="/admin/modules?tab=ARCHIVED">{t("admin.modules.tabArchived")}</Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.modules.tableTitle")}</TableHead>
              <TableHead>{t("admin.modules.tableStatus")}</TableHead>
              <TableHead>{t("admin.modules.tableCategory")}</TableHead>
              <TableHead>{t("admin.modules.tableDifficulty")}</TableHead>
              <TableHead>{t("admin.modules.tableSections")}</TableHead>
              <TableHead>{t("admin.modules.tableCreatedBy")}</TableHead>
              <TableHead>{t("admin.modules.tableCreatedAt")}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground"
                >
                  {t("admin.modules.noModulesFound")}
                </TableCell>
              </TableRow>
            ) : (
              modules.map((module) => (
                <TableRow key={module.id}>
                  <TableCell>
                    <Link
                      href={`/admin/modules/${module.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {module.title}
                    </Link>
                    {module.isMandatory && (
                      <Badge variant="destructive" className="ml-2 text-xs">
                        {t("common.mandatory")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadgeVariant[module.status]}
                    >
                      {t(`moduleStatus.${module.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {module.category?.name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={difficultyBadgeVariant[module.difficulty]}
                    >
                      {t(`difficulty.${module.difficulty}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>{module._count.sections}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {module.createdBy.firstName} {module.createdBy.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {format(new Date(module.createdAt), "d. MMM yyyy", { locale: getDateLocale() })}
                  </TableCell>
                  <TableCell>
                    <ModuleActions
                      moduleId={module.id}
                      status={module.status}
                      isCompanyPinned={companyPinSet.has(module.id)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
