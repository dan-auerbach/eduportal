import { redirect, notFound } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { checkModuleAccess } from "@/lib/permissions";
import { getQuizForAttempt } from "@/actions/quiz";
import { QuizPlayer } from "@/components/modules/quiz-player";

type Params = Promise<{ id: string; quizId: string }>;

export default async function QuizPage({
  params,
}: {
  params: Params;
}) {
  const ctx = await getTenantContext();
  const user = ctx.user;

  const { id: moduleId, quizId } = await params;

  // Check module access (tenant-scoped)
  const hasAccess = await checkModuleAccess(user.id, moduleId, ctx.tenantId);
  if (!hasAccess) {
    redirect("/modules");
  }

  // Verify quiz/module belong to tenant
  const moduleCheck = await prisma.module.findUnique({
    where: { id: moduleId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!moduleCheck) {
    notFound();
  }

  // Load quiz data
  const result = await getQuizForAttempt(quizId);

  if (!result.success) {
    // If sections not completed, redirect back to module
    redirect(`/modules/${moduleId}`);
  }

  // Verify the quiz belongs to the correct module
  if (result.data.moduleId !== moduleId) {
    notFound();
  }

  return (
    <div className="container max-w-4xl py-8">
      <QuizPlayer quiz={result.data} />
    </div>
  );
}
