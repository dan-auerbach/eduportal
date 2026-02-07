import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ModuleEditor } from "@/components/admin/module-editor";
import { createModule } from "@/actions/modules";
import { t } from "@/lib/i18n";

export default async function AdminModuleEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "MANAGE_ALL_MODULES", { tenantId: ctx.tenantId }, {
    permission: "MANAGE_OWN_MODULES",
    check: true,
  });

  const { id } = await params;

  // Handle "new" module creation
  if (id === "new") {
    const result = await createModule({
      title: t("admin.editor.untitledModule"),
      description: t("admin.editor.defaultDescription"),
      difficulty: "BEGINNER",
    });

    if (result.success) {
      redirect(`/admin/modules/${result.data.id}/edit`);
    } else {
      throw new Error(result.error);
    }
  }

  // Verify module belongs to tenant
  const module = await prisma.module.findUnique({
    where: { id, tenantId: ctx.tenantId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
      },
      groups: {
        include: {
          group: {
            select: { id: true, name: true, color: true },
          },
        },
      },
      category: {
        select: { id: true, name: true },
      },
      tags: {
        include: { tag: true },
      },
      quizzes: {
        orderBy: { sortOrder: "asc" },
        include: {
          questions: {
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });

  if (!module) {
    notFound();
  }

  // Get all groups for assignment selector (scoped to tenant)
  const allGroups = await prisma.group.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });

  // Get all categories for category dropdown (scoped to tenant)
  const allCategories = await prisma.moduleCategory.findMany({
    where: { tenantId: ctx.tenantId },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/modules">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{module.title}</h1>
          <p className="text-muted-foreground">{t("admin.modules.editSubtitle")}</p>
        </div>
      </div>

      <ModuleEditor
        moduleId={module.id}
        module={{
          title: module.title,
          description: module.description,
          difficulty: module.difficulty,
          estimatedTime: module.estimatedTime,
          isMandatory: module.isMandatory,
          status: module.status,
          coverImage: module.coverImage,
          version: module.version,
          categoryId: module.categoryId,
        }}
        sections={module.sections.map((s) => ({
          id: s.id,
          title: s.title,
          content: s.content,
          type: s.type,
          sortOrder: s.sortOrder,
          unlockAfterSectionId: s.unlockAfterSectionId,
        }))}
        groups={module.groups.map((g) => ({
          moduleId: module.id,
          groupId: g.groupId,
          deadlineDays: g.deadlineDays,
          isMandatory: g.isMandatory,
          group: g.group,
        }))}
        tags={module.tags}
        allGroups={allGroups}
        allCategories={allCategories}
        quizzes={module.quizzes.map((q) => ({
          id: q.id,
          title: q.title,
          passingScore: q.passingScore,
          maxAttempts: q.maxAttempts,
          questions: q.questions.map((qn) => ({
            id: qn.id,
            question: qn.question,
            options: qn.options as { text: string; isCorrect: boolean }[],
            sortOrder: qn.sortOrder,
          })),
        }))}
      />
    </div>
  );
}
