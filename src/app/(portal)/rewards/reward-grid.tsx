"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Zap, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type Reward = {
  id: string;
  title: string;
  description: string | null;
  costXp: number;
  quantityAvailable: number | null;
  approvalRequired: boolean;
};

type RewardGridProps = {
  rewards: Reward[];
  currentXp: number;
};

export function RewardGrid({ rewards, currentXp }: RewardGridProps) {
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rewards.map((reward) => {
          const canAfford = currentXp >= reward.costXp;
          const isOutOfStock = reward.quantityAvailable !== null && reward.quantityAvailable <= 0;

          return (
            <Card key={reward.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{reward.title}</CardTitle>
                  <Badge variant="secondary" className="shrink-0 gap-1">
                    <Zap className="h-3 w-3 text-yellow-500" />
                    {reward.costXp}
                  </Badge>
                </div>
                {reward.description && (
                  <CardDescription className="line-clamp-2">{reward.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto pt-2">
                <div className="flex items-center justify-between">
                  {isOutOfStock ? (
                    <Badge variant="destructive">{t("rewards.outOfStock")}</Badge>
                  ) : reward.quantityAvailable !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {t("rewards.remaining", { count: reward.quantityAvailable.toString() })}
                    </span>
                  ) : (
                    <span />
                  )}
                  <Button
                    size="sm"
                    disabled={!canAfford || isOutOfStock}
                    onClick={() => setSelectedReward(reward)}
                  >
                    <Gift className="mr-1 h-4 w-4" />
                    {t("rewards.redeem")}
                  </Button>
                </div>
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
