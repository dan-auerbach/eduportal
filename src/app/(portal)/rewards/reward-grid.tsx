"use client";

import { useState, useTransition, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { redeemReward } from "@/actions/rewards";
import type { StorefrontRewardDTO } from "@/actions/rewards";
import {
  Zap,
  Loader2,
  Gift,
  Flame,
  Clock,
  Star,
  Package,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type RewardGridProps = {
  rewards: StorefrontRewardDTO[];
  currentXp: number;
};

/** Compute badges for each reward */
function computeBadges(rewards: StorefrontRewardDTO[]) {
  // Popular: highest totalRedemptionsThisMonth (must be > 0)
  const maxRedemptions = Math.max(
    ...rewards.map((r) => r.totalRedemptionsThisMonth),
    0,
  );

  // Exclusive: top 20% cost (at least 1)
  const costs = rewards.map((r) => r.costXp).sort((a, b) => b - a);
  const exclusiveThreshold = costs[Math.max(0, Math.ceil(costs.length * 0.2) - 1)] ?? Infinity;

  return rewards.map((r) => ({
    isPopular: maxRedemptions > 0 && r.totalRedemptionsThisMonth === maxRedemptions,
    isLimited: r.quantityAvailable !== null && r.quantityAvailable > 0 && r.quantityAvailable <= 5,
    isExclusive: r.costXp >= exclusiveThreshold && costs.length >= 3,
  }));
}

// Gradient palette for cards without images
const GRADIENTS = [
  "from-violet-500/20 to-indigo-500/10",
  "from-emerald-500/20 to-teal-500/10",
  "from-amber-500/20 to-orange-500/10",
  "from-rose-500/20 to-pink-500/10",
  "from-sky-500/20 to-cyan-500/10",
  "from-fuchsia-500/20 to-purple-500/10",
];

export function RewardGrid({ rewards, currentXp }: RewardGridProps) {
  const [selectedReward, setSelectedReward] = useState<StorefrontRewardDTO | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const badges = useMemo(() => computeBadges(rewards), [rewards]);

  // Shadow motivation: cheapest unaffordable reward
  const cheapestUnaffordable = useMemo(() => {
    const unaffordable = rewards
      .filter((r) => r.costXp > currentXp)
      .filter((r) => r.quantityAvailable === null || r.quantityAvailable > 0);
    if (unaffordable.length === 0) return null;
    return unaffordable.reduce((min, r) => (r.costXp < min.costXp ? r : min));
  }, [rewards, currentXp]);

  function handleRedeem() {
    if (!selectedReward) return;

    startTransition(async () => {
      const result = await redeemReward(selectedReward.id);
      if (result.success) {
        toast.success(t("rewards.redeemSuccess"));
        setSelectedReward(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      {/* Shadow motivation banner */}
      {cheapestUnaffordable && (
        <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary shrink-0" />
          <span>
            {t("rewards.missingXp", {
              xp: (cheapestUnaffordable.costXp - currentXp).toString(),
              title: cheapestUnaffordable.title,
            })}
          </span>
        </div>
      )}

      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rewards.map((reward, idx) => {
          const canAfford = currentXp >= reward.costXp;
          const isOutOfStock =
            reward.quantityAvailable !== null && reward.quantityAvailable <= 0;
          const monthlyLimitReached =
            reward.monthlyLimit !== null &&
            reward.monthlyRedemptions >= reward.monthlyLimit;
          const isDisabled = !canAfford || isOutOfStock || monthlyLimitReached;
          const missingXp = reward.costXp - currentXp;
          const { isPopular, isLimited, isExclusive } = badges[idx];
          const gradient = GRADIENTS[idx % GRADIENTS.length];

          return (
            <Card
              key={reward.id}
              className={`flex flex-col overflow-hidden transition-shadow hover:shadow-md ${
                isDisabled ? "opacity-75" : ""
              }`}
            >
              {/* Card header with gradient/image */}
              <div
                className={`relative h-28 bg-gradient-to-br ${gradient} flex items-center justify-center`}
              >
                {reward.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={reward.imageUrl}
                    alt={reward.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <Gift className="h-10 w-10 text-muted-foreground/30" />
                )}

                {/* XP price badge */}
                <div className="absolute top-2 right-2">
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-background/90 backdrop-blur-sm shadow-sm text-sm font-semibold"
                  >
                    <Zap className="h-3.5 w-3.5 text-yellow-500" />
                    {reward.costXp}
                  </Badge>
                </div>

                {/* Badges row */}
                <div className="absolute bottom-2 left-2 flex gap-1">
                  {isPopular && (
                    <Badge className="bg-orange-500/90 text-white text-[10px] gap-0.5 px-1.5 py-0">
                      <Flame className="h-3 w-3" />
                      {t("rewards.popular")}
                    </Badge>
                  )}
                  {isLimited && (
                    <Badge className="bg-red-500/90 text-white text-[10px] gap-0.5 px-1.5 py-0">
                      <Clock className="h-3 w-3" />
                      {t("rewards.limited")}
                    </Badge>
                  )}
                  {isExclusive && (
                    <Badge className="bg-purple-500/90 text-white text-[10px] gap-0.5 px-1.5 py-0">
                      <Star className="h-3 w-3" />
                      {t("rewards.exclusive")}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Card body */}
              <CardContent className="flex flex-col flex-1 gap-3 p-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-sm leading-tight line-clamp-2">
                    {reward.title}
                  </h3>
                  {reward.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {reward.description}
                    </p>
                  )}
                </div>

                {/* Meta row: stock + monthly usage */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {reward.quantityAvailable !== null ? (
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {isOutOfStock
                        ? t("rewards.outOfStock")
                        : t("rewards.availableStock", {
                            count: reward.quantityAvailable.toString(),
                          })}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      {t("rewards.unlimitedStock")}
                    </span>
                  )}
                  {reward.monthlyLimit !== null && (
                    <span>
                      {t("rewards.monthlyUsage", {
                        used: reward.monthlyRedemptions.toString(),
                        limit: reward.monthlyLimit.toString(),
                      })}
                    </span>
                  )}
                </div>

                {/* Missing XP hint */}
                {!canAfford && !isOutOfStock && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {t("rewards.missingXpShort", { xp: missingXp.toString() })}
                  </p>
                )}

                {/* Redeem button */}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={isDisabled}
                  onClick={() => setSelectedReward(reward)}
                >
                  <Gift className="mr-1.5 h-4 w-4" />
                  {isOutOfStock
                    ? t("rewards.outOfStock")
                    : monthlyLimitReached
                      ? t("rewards.monthlyLimitReached")
                      : !canAfford
                        ? t("rewards.cantAfford")
                        : t("rewards.redeem")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!selectedReward} onOpenChange={() => setSelectedReward(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rewards.confirmRedeem")}</DialogTitle>
            <DialogDescription>
              {selectedReward && (
                <>
                  {t("rewards.confirmRedeemMessage", {
                    title: selectedReward.title,
                    cost: selectedReward.costXp.toString(),
                  })}
                  {selectedReward.approvalRequired && (
                    <span className="mt-2 block text-amber-600 dark:text-amber-400">
                      {t("rewards.requiresApproval")}
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReward(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleRedeem} disabled={isPending}>
              {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {t("rewards.confirmRedeemAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
