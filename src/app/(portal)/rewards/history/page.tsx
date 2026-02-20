import { t } from "@/lib/i18n";
import { getMyRedemptions } from "@/actions/rewards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, ArrowLeft, Gift, CheckCircle2, XCircle, Clock } from "lucide-react";
import Link from "next/link";

const STATUS_CONFIG = {
  PENDING: { label: () => t("rewards.pendingApprovals"), variant: "outline" as const, icon: Clock },
  APPROVED: { label: () => t("rewards.approved"), variant: "default" as const, icon: CheckCircle2 },
  REJECTED: { label: () => t("rewards.rejected"), variant: "destructive" as const, icon: XCircle },
} as const;

export default async function RewardsHistoryPage() {
  const result = await getMyRedemptions();
  const redemptions = result.success ? result.data! : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6" />
            {t("rewards.redemptionHistory")}
          </h1>
          <p className="text-muted-foreground">
            {t("rewards.redemptionHistorySubtitle")}
          </p>
        </div>
        <Link
          href="/rewards"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("rewards.backToStore")}
        </Link>
      </div>

      {/* Redemptions list */}
      {redemptions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">{t("rewards.noRedemptions")}</p>
            <p className="mt-1 text-sm">{t("rewards.noRedemptionsHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("rewards.myRedemptions")} ({redemptions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {redemptions.map((r) => {
                const config = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG];
                const StatusIcon = config?.icon ?? Clock;
                const date = new Date(r.createdAt);

                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-4 px-6 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.rewardTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleDateString()} &middot; {r.xpSpent} XP
                      </p>
                      {r.rejectReason && (
                        <p className="text-xs text-destructive mt-0.5">
                          {r.rejectReason}
                        </p>
                      )}
                    </div>
                    <Badge variant={config?.variant ?? "outline"} className="gap-1 shrink-0">
                      <StatusIcon className="h-3 w-3" />
                      {config?.label() ?? r.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
