"use client";

import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Check, X, Loader2 } from "lucide-react";
import { reviewRedemption } from "@/actions/rewards";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type PendingRedemption = {
  id: string;
  userName?: string;
  rewardTitle: string;
  xpSpent: number;
  createdAt: string;
};

type PendingRedemptionsProps = {
  redemptions: PendingRedemption[];
};

export function PendingRedemptions({ redemptions }: PendingRedemptionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReview(id: string, approved: boolean) {
    startTransition(async () => {
      const result = await reviewRedemption(id, approved);
      if (result.success) {
        toast.success(approved ? t("rewards.approved") : t("rewards.rejected"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      {redemptions.map((r) => {
        const date = new Date(r.createdAt);
        return (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{r.userName ?? "—"}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{r.rewardTitle}</span>
                  <span>&middot;</span>
                  <span className="flex items-center gap-0.5">
                    <Zap className="h-3 w-3 text-yellow-500" />
                    {r.xpSpent} XP
                  </span>
                  <span>&middot;</span>
                  <time dateTime={r.createdAt}>
                    {date.toLocaleDateString("sl-SI", { day: "numeric", month: "short" })}
                  </time>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="default"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleReview(r.id, true)}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleReview(r.id, false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
