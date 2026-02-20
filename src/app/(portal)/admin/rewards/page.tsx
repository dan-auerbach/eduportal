import { t } from "@/lib/i18n";
import { getAdminRewards, getPendingRedemptions, getAllRedemptions } from "@/actions/rewards";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gift, Zap } from "lucide-react";
import { AdminRewardActions } from "./actions";
import { PendingRedemptions } from "./pending-redemptions";
import { RewardRedemptionHistory, FullRedemptionLog } from "./redemption-log";

export default async function AdminRewardsPage() {
  const [rewardsResult, pendingResult, allRedemptionsResult] = await Promise.all([
    getAdminRewards(),
    getPendingRedemptions(),
    getAllRedemptions(),
  ]);

  const rewards = rewardsResult.success ? rewardsResult.data! : [];
  const pending = pendingResult.success ? pendingResult.data! : [];
  const allRedemptions = allRedemptionsResult.success ? allRedemptionsResult.data! : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("rewards.adminTitle")}</h1>
          <p className="text-muted-foreground">{t("rewards.adminSubtitle")}</p>
        </div>
        <AdminRewardActions mode="create" />
      </div>

      {/* Pending redemptions */}
      {pending.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-amber-600 dark:text-amber-400">
            {t("rewards.pendingApprovals")} ({pending.length})
          </h2>
          <PendingRedemptions redemptions={pending} />
        </div>
      )}

      {/* Rewards catalog */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("rewards.catalog")}</h2>
        {rewards.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Gift className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="font-medium">{t("rewards.noRewards")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rewards.map((reward) => (
              <Card key={reward.id}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{reward.title}</p>
                        {!reward.active && (
                          <Badge variant="outline" className="text-xs">
                            {t("rewards.inactive")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          <Zap className="h-3 w-3 text-yellow-500" />
                          {reward.costXp} XP
                        </span>
                        {reward.monthlyLimit && (
                          <span>{t("rewards.monthlyLimit")}: {reward.monthlyLimit}</span>
                        )}
                        {reward.quantityAvailable !== null && (
                          <span>{t("rewards.stock")}: {reward.quantityAvailable}</span>
                        )}
                        <span>
                          {reward.approvalRequired
                            ? t("rewards.approvalRequired")
                            : t("rewards.autoApprove")}
                        </span>
                      </div>
                    </div>
                    <AdminRewardActions mode="edit" reward={reward} />
                  </div>
                  {/* Per-reward redemption history */}
                  <RewardRedemptionHistory
                    rewardId={reward.id}
                    rewardTitle={reward.title}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Full redemption log */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">{t("rewards.redemptionLog")}</h2>
        <FullRedemptionLog initialRedemptions={allRedemptions} />
      </div>
    </div>
  );
}
