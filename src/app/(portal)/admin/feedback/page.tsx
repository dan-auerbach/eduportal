import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { requirePermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowRight } from "lucide-react";
import Link from "next/link";
import { t } from "@/lib/i18n";

export default async function AdminFeedbackPage() {
  const ctx = await getTenantContext();
  await requirePermission(ctx.user, "VIEW_ANALYTICS", { tenantId: ctx.tenantId });

  // Get all published modules with their feedback stats
  const modules = await prisma.module.findMany({
    where: { tenantId: ctx.tenantId, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      selfAssessments: {
        select: { rating: true },
      },
    },
    orderBy: { title: "asc" },
  });

  // Compute stats per module
  const moduleStats = modules.map((m) => {
    const ratings = m.selfAssessments.map((a) => a.rating);
    const count = ratings.length;
    const avg = count > 0 ? ratings.reduce((sum, r) => sum + r, 0) / count : 0;
    const min = count > 0 ? Math.min(...ratings) : 0;
    return {
      id: m.id,
      title: m.title,
      count,
      avg: Math.round(avg * 10) / 10,
      min,
    };
  });

  // Sort: modules with ratings first (by avg asc for quick identification of issues), then unrated
  const sorted = [...moduleStats].sort((a, b) => {
    if (a.count === 0 && b.count === 0) return 0;
    if (a.count === 0) return 1;
    if (b.count === 0) return -1;
    return a.avg - b.avg;
  });

  const totalRatings = moduleStats.reduce((sum, m) => sum + m.count, 0);
  const globalAvg =
    totalRatings > 0
      ? Math.round(
          (moduleStats.reduce((sum, m) => sum + m.avg * m.count, 0) / totalRatings) * 10
        ) / 10
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("admin.feedback.title")}</h1>
        <p className="text-muted-foreground">{t("admin.feedback.subtitle")}</p>
      </div>

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.feedback.avgRating")}</CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalAvg > 0 ? globalAvg : "—"}</div>
            <div className="flex items-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-3.5 w-3.5 ${
                    star <= Math.round(globalAvg)
                      ? "text-amber-500 fill-amber-500"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("admin.feedback.totalRatings")}</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRatings}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.feedback.acrossModules", { count: String(moduleStats.filter((m) => m.count > 0).length) })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Module list */}
      <Card>
        <CardContent className="pt-6">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("admin.feedback.noRatings")}
            </p>
          ) : (
            <div className="space-y-1">
              {sorted.map((m) => (
                <Link
                  key={m.id}
                  href={`/admin/feedback/${m.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.count > 0 ? (
                        <>
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-3 w-3 ${
                                  star <= Math.round(m.avg)
                                    ? "text-amber-500 fill-amber-500"
                                    : "text-muted-foreground/30"
                                }`}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {m.avg} ({m.count})
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("admin.feedback.noRatings")}
                        </span>
                      )}
                    </div>
                  </div>
                  {m.count > 0 && m.avg <= 2 && (
                    <Badge variant="destructive" className="text-[11px] shrink-0">
                      {t("admin.feedback.lowRating")}
                    </Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
