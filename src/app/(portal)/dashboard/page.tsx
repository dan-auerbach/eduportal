import { Suspense } from "react";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

export default async function DashboardPage() {
  // Critical: only getTenantContext (cached — shared with layout, zero extra DB cost)
  const ctx = await getTenantContext();

  return (
    <div className="space-y-8">
      {/* ─── Greeting (critical — renders instantly) ─── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("dashboard.welcome", { name: ctx.user.firstName })}
        </h1>
        <p className="text-muted-foreground mt-0.5">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* ─── Deferred content (hero, stats, deadlines, modules) ─── */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent
          userId={ctx.user.id}
          tenantId={ctx.tenantId}
          effectiveRole={ctx.effectiveRole}
        />
      </Suspense>
    </div>
  );
}
