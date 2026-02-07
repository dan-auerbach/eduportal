import { redirect, notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { getModuleProgress } from "@/lib/progress";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CheckCircle2,
  Award,
  ArrowRight,
  BookOpen,
  RotateCcw,
  ClipboardList,
} from "lucide-react";

type Params = Promise<{ id: string }>;

export default async function ModuleCompletedPage({
  params,
}: {
  params: Params;
}) {
  const ctx = await getTenantContext();
  const { id: moduleId } = await params;

  // Check module access
  const hasAccess = await checkModuleAccess(ctx.user.id, moduleId, ctx.tenantId);
  if (!hasAccess) {
    redirect("/modules");
  }

  // Load module
  const module = await prisma.module.findUnique({
    where: { id: moduleId, tenantId: ctx.tenantId },
    select: { id: true, title: true },
  });

  if (!module) {
    notFound();
  }

  // Get progress state
  const progress = await getModuleProgress(ctx.user.id, moduleId, ctx.tenantId);

  // Guard: only show completion page if all sections are done
  if (progress.completedSections < progress.totalSections) {
    redirect(`/modules/${moduleId}`);
  }

  // Get first quiz ID for CTA (if quizzes exist and not all passed)
  let firstQuizId: string | null = null;
  if (progress.hasQuizzes && !progress.allQuizzesPassed) {
    const unpassed = progress.quizResults.find((q) => !q.passed);
    firstQuizId = unpassed?.quizId ?? progress.quizResults[0]?.quizId ?? null;
  }

  // Get completion date (latest section completion date)
  const lastCompletion = await prisma.sectionCompletion.findFirst({
    where: {
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
      section: { moduleId },
    },
    orderBy: { completedAt: "desc" },
    select: { completedAt: true },
  });

  const completedAt = lastCompletion?.completedAt ?? null;
  const showQuizReminder = progress.hasQuizzes && !progress.allQuizzesPassed;
  const showCertificate = progress.certificateIssued;

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-12 px-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-10 pb-8 px-8 text-center space-y-6">
          {/* Success icon */}
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-950/50 p-4">
              <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
            </div>
          </div>

          {/* Title & subtitle */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{t("completion.title")}</h1>
            <p className="text-muted-foreground">
              {t("completion.subtitle", { title: module.title })}
            </p>
            {completedAt && (
              <p className="text-sm text-muted-foreground">
                {t("completion.completedAt", {
                  date: format(new Date(completedAt), "d. MMM yyyy", {
                    locale: getDateLocale(),
                  }),
                })}
              </p>
            )}
          </div>

          {/* Certificate issued banner */}
          {showCertificate && (
            <div className="flex items-center gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <Award className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                {t("completion.certificateEarned")}
              </p>
            </div>
          )}

          {/* Quiz reminder */}
          {showQuizReminder && (
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-4 py-3">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {t("completion.quizReminder")}
              </p>
            </div>
          )}

          {/* CTAs */}
          <div className="space-y-3 pt-2">
            {/* Primary CTA */}
            {showQuizReminder && firstQuizId ? (
              <Button asChild className="w-full" size="lg">
                <Link href={`/modules/${moduleId}/quiz/${firstQuizId}`}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  {t("completion.takeQuiz")}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            ) : (
              <Button asChild className="w-full" size="lg">
                <Link href="/modules">
                  <BookOpen className="h-4 w-4 mr-2" />
                  {t("completion.backToModules")}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            )}

            {/* Secondary CTAs */}
            <div className="flex gap-3">
              <Button variant="outline" asChild className="flex-1">
                <Link href="/certificates">
                  <Award className="h-4 w-4 mr-2" />
                  {t("completion.viewCertificates")}
                </Link>
              </Button>
              <Button variant="outline" asChild className="flex-1">
                <Link href={`/modules/${moduleId}`}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  {t("completion.repeatModule")}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
