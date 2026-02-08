import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { t } from "@/lib/i18n";

type Params = Promise<{ moduleId: string }>;

export default async function AdminFeedbackDetailPage({
  params,
}: {
  params: Params;
}) {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ANALYTICS", { tenantId: ctx.tenantId });

  const { moduleId } = await params;

  // Load module + all feedback
  const module = await prisma.module.findUnique({
    where: { id: moduleId, tenantId: ctx.tenantId },
    select: {
      id: true,
      title: true,
      selfAssessments: {
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
  });

  if (!module) {
    notFound();
  }

  const ratings = module.selfAssessments.map((a) => a.rating);
  const count = ratings.length;
  const avg = count > 0 ? ratings.reduce((sum, r) => sum + r, 0) / count : 0;
  const avgRounded = Math.round(avg * 10) / 10;

  // Distribution
  const distribution = [1, 2, 3, 4, 5].map((star) => ({
    star,
    count: ratings.filter((r) => r === star).length,
    percentage: count > 0 ? Math.round((ratings.filter((r) => r === star).length / count) * 100) : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/feedback">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{module.title}</h1>
          <p className="text-muted-foreground">{t("admin.feedback.subtitle")}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.feedback.avgRating")}</CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgRounded > 0 ? avgRounded : "—"}</div>
            <div className="flex items-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-3.5 w-3.5 ${
                    star <= Math.round(avg)
                      ? "text-amber-500 fill-amber-500"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.feedback.distribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {distribution.reverse().map((d) => (
                <div key={d.star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-right font-medium">{d.star}</span>
                  <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${d.percentage}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{d.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suggestions list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.feedback.suggestions")} ({count})</CardTitle>
        </CardHeader>
        <CardContent>
          {module.selfAssessments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("admin.feedback.noRatings")}
            </p>
          ) : (
            <div className="space-y-3">
              {module.selfAssessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="rounded-lg border border-border/50 px-4 py-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            className={`h-3 w-3 ${
                              star <= assessment.rating
                                ? "text-amber-500 fill-amber-500"
                                : "text-muted-foreground/30"
                            }`}
                          />
                        ))}
                      </div>
                      {assessment.rating <= 2 && (
                        <Badge variant="destructive" className="text-[10px] h-4">
                          {t("admin.feedback.lowRating")}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {format(new Date(assessment.createdAt), "d. MMM yyyy", {
                        locale: getDateLocale(),
                      })}
                    </span>
                  </div>
                  {assessment.note && (
                    <p className="text-sm text-foreground/90">{assessment.note}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    {t("admin.feedback.ratedBy")}: {assessment.user.firstName} {assessment.user.lastName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
