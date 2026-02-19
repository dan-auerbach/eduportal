import { t } from "@/lib/i18n";
import { getRewards, getMyRedemptions } from "@/actions/rewards";
import { getMyXpBalance } from "@/actions/xp";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { XpDisplay } from "@/components/gamification/xp-display";
import { Gift, ShoppingBag } from "lucide-react";
import { RewardGrid } from "./reward-grid";
import { RedemptionHistory } from "./redemption-history";

export default async function RewardsPage() {
  const [rewardsResult, balanceResult, redemptionsResult] = await Promise.all([
    getRewards(),
    getMyXpBalance(),
    getMyRedemptions(),
  ]);

  const rewards = rewardsResult.success ? rewardsResult.data! : [];
  const balance = balanceResult.success ? balanceResult.data! : null;
  const redemptions = redemptionsResult.success ? redemptionsResult.data! : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("rewards.title")}</h1>
        <p className="text-muted-foreground">{t("rewards.subtitle")}</p>
      </div>

      {/* Balance card */}
      {balance && (
        <Card>
          <CardContent className="py-4">
            <XpDisplay
              totalXp={balance.totalXp}
              rank={balance.rank}
              nextRank={balance.nextRank}
              variant="full"
            />
          </CardContent>
        </Card>
      )}

      {/* Rewards catalog */}
      <div>
        <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
          <Gift className="h-5 w-5" />
          {t("rewards.catalog")}
        </h2>
        {rewards.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Gift className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="font-medium">{t("rewards.noRewards")}</p>
            </CardContent>
          </Card>
        ) : (
          <RewardGrid rewards={rewards} currentXp={balance?.totalXp ?? 0} />
        )}
      </div>

      {/* Redemption history */}
      {redemptions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            {t("rewards.myRedemptions")}
          </h2>
          <RedemptionHistory redemptions={redemptions} />
        </div>
      )}
    </div>
  );
}
