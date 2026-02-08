import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Building2, Users, Plus, Star } from "lucide-react";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { TenantActions } from "./tenant-actions";

export default async function OwnerDashboardPage() {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    redirect("/dashboard");
  }

  const [tenants, globalUserCount, ratingStats] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            memberships: true,
            modules: true,
          },
        },
      },
    }),
    prisma.user.count({ where: { isActive: true, deletedAt: null } }),
    prisma.moduleSelfAssessment.aggregate({
      _avg: { rating: true },
      _count: true,
    }),
  ]);

  const globalAvgRating = ratingStats._avg.rating
    ? Math.round(ratingStats._avg.rating * 10) / 10
    : 0;
  const globalRatingCount = ratingStats._count;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("owner.dashboard")}</h1>
          <p className="text-muted-foreground">{t("owner.subtitle")}</p>
        </div>
        <Button asChild>
          <Link href="/owner/tenants/new">
            <Plus className="mr-2 h-4 w-4" />
            {t("tenant.createTenant")}
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("owner.totalTenants")}
            </CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-muted-foreground">
              {tenants.filter((te) => !te.archivedAt).length} {t("tenant.active").toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("owner.totalUsersGlobal")}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalUserCount}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin.dashboard.active", { count: globalUserCount })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {t("owner.avgRating")}
            </CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalAvgRating > 0 ? globalAvgRating : "—"}</div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-3 w-3 ${
                      star <= Math.round(globalAvgRating)
                        ? "text-amber-500 fill-amber-500"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                ({globalRatingCount})
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant overview */}
      <div>
        <h2 className="text-lg font-semibold mb-4">{t("owner.tenantOverview")}</h2>

        {tenants.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t("tenant.noTenants")}</p>
              <p className="text-sm text-muted-foreground">{t("owner.createFirst")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tenants.map((tenant) => (
              <Card key={tenant.id} className={tenant.archivedAt ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{tenant.name}</CardTitle>
                      <CardDescription className="text-xs">/{tenant.slug}</CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={tenant.plan === "PRO" ? "default" : tenant.plan === "STARTER" ? "outline" : "secondary"}
                        className="text-xs"
                      >
                        {t(`plan.${tenant.plan.toLowerCase()}`)}
                      </Badge>
                      {tenant.archivedAt && (
                        <Badge variant="destructive" className="text-xs">
                          {t("tenant.archivedLabel")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">
                      <Users className="inline h-3.5 w-3.5 mr-1" />
                      {tenant._count.memberships} {t("common.members")}
                    </div>
                    <div className="text-muted-foreground">
                      <Building2 className="inline h-3.5 w-3.5 mr-1" />
                      {tenant._count.modules} {t("common.modules")}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(tenant.createdAt), "d. MMMM yyyy", { locale: getDateLocale() })}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <TenantActions
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      tenantSlug={tenant.slug}
                      isArchived={!!tenant.archivedAt}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
