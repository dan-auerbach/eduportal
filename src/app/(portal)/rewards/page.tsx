import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { getTenantContext } from "@/lib/tenant";
import { getStorefrontRewards } from "@/actions/rewards";
import { getMyXpBalance } from "@/actions/xp";
import { Card, CardContent } from "@/components/ui/card";
import { XpDisplay } from "@/components/gamification/xp-display";
import { Gift, ShoppingBag, History } from "lucide-react";
import { RewardGrid } from "./reward-grid";
import Link from "next/link";

export default async function RewardsStorefrontPage() {
  const ctx = await getTenantContext();
  if (!ctx.config.features.rewards) redirect("/dashboard");

  const [rewardsResult, balanceResult] = await Promise.all([
    getStorefrontRewards(),
    getMyXpBalance(),
  ]);

  const rewards = rewardsResult.success ? rewardsResult.data! : [];
  const balance = balanceResult.success ? balanceResult.data! : null;

  return (
    <div className="space-y-6">
      {/* Header with balance */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" />
            {t("rewards.storefront")}
          </h1>
          <p className="text-muted-foreground">{t("rewards.storefrontSubtitle")}</p>
        </div>
        <Link
          href="/rewards/history"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <History className="h-4 w-4" />
          {t("rewards.viewHistory")}
        </Link>
      </div>

      {/* XP Balance card */}
      {balance && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="py-4">
            <XpDisplay
              lifetimeXp={balance.lifetimeXp}
              spendableXp={balance.spendableXp}
              rank={balance.rank}
              nextRank={balance.nextRank}
              variant="full"
            />
          </CardContent>
        </Card>
      )}

      {/* Rewards catalog */}
      {rewards.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">{t("rewards.noRewards")}</p>
          </CardContent>
        </Card>
      ) : (
        <RewardGrid
          rewards={rewards}
          currentXp={balance?.spendableXp ?? 0}
        />
      )}
    </div>
  );
}
