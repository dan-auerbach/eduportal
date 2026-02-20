"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Check,
  X,
  Clock,
  User,
  ShoppingBag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { t } from "@/lib/i18n";
import { getAllRedemptions, reviewRedemption } from "@/actions/rewards";
import type { RedemptionDTO } from "@/actions/rewards";
import type { RedemptionStatus } from "@/generated/prisma/client";

// ── Status badge helper ─────────────────────────────────────────────────────

const statusConfig: Record<
  RedemptionStatus,
  { label: () => string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  PENDING: { label: () => t("rewards.pendingStatus"), variant: "secondary" },
  APPROVED: { label: () => t("rewards.approved"), variant: "default" },
  REJECTED: { label: () => t("rewards.rejected"), variant: "destructive" },
  CANCELLED: { label: () => t("rewards.cancelled"), variant: "outline" },
};

function StatusBadge({ status }: { status: RedemptionStatus }) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label()}
    </Badge>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Per-reward redemption history (collapsible inside reward card) ───────────

type RewardRedemptionHistoryProps = {
  rewardId: string;
  rewardTitle: string;
};

export function RewardRedemptionHistory({
  rewardId,
  rewardTitle,
}: RewardRedemptionHistoryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [redemptions, setRedemptions] = useState<RedemptionDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (isOpen && !hasLoaded) {
      setIsLoading(true);
      getAllRedemptions(rewardId).then((result) => {
        if (result.success) {
          setRedemptions(result.data);
        }
        setIsLoading(false);
        setHasLoaded(true);
      });
    }
  }, [isOpen, hasLoaded, rewardId]);

  function refreshData() {
    setIsLoading(true);
    getAllRedemptions(rewardId).then((result) => {
      if (result.success) {
        setRedemptions(result.data);
      }
      setIsLoading(false);
    });
  }

  function handleReview(id: string, approved: boolean) {
    startTransition(async () => {
      const result = await reviewRedemption(id, approved);
      if (result.success) {
        toast.success(approved ? t("rewards.approved") : t("rewards.rejected"));
        refreshData();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const pendingCount = redemptions.filter((r) => r.status === "PENDING").length;
  const approvedCount = redemptions.filter((r) => r.status === "APPROVED").length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ShoppingBag className="h-3 w-3" />
          {t("rewards.redemptions")}
          {hasLoaded && ` (${redemptions.length})`}
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-0.5">
              {pendingCount} {t("rewards.pendingStatus").toLowerCase()}
            </Badge>
          )}
          {isOpen ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        {isLoading && !hasLoaded ? (
          <div className="flex items-center justify-center py-3 text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            {t("common.loading")}
          </div>
        ) : redemptions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            {t("rewards.noRedemptionsYet")}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {redemptions.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.userName}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-0.5">
                      <Zap className="h-3 w-3 text-yellow-500" />
                      {r.xpSpent} XP
                    </span>
                    <span>&middot;</span>
                    <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                    {r.reviewedByName && r.reviewedAt && (
                      <>
                        <span>&middot;</span>
                        <span>
                          {t("rewards.reviewedBy")} {r.reviewedByName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {r.status === "PENDING" && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="default"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={isPending}
                      onClick={() => handleReview(r.id, true)}
                      title={t("rewards.approved")}
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-6 w-6 p-0"
                      disabled={isPending}
                      onClick={() => handleReview(r.id, false)}
                      title={t("rewards.rejected")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Full Redemption Log (all rewards) ───────────────────────────────────────

type FullRedemptionLogProps = {
  initialRedemptions: RedemptionDTO[];
};

export function FullRedemptionLog({ initialRedemptions }: FullRedemptionLogProps) {
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReview(id: string, approved: boolean) {
    startTransition(async () => {
      const result = await reviewRedemption(id, approved);
      if (result.success) {
        toast.success(approved ? t("rewards.approved") : t("rewards.rejected"));
        // Update local state
        setRedemptions((prev) =>
          prev.map((r) =>
            r.id === id
              ? { ...r, status: (approved ? "APPROVED" : "REJECTED") as RedemptionStatus }
              : r
          )
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (redemptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <ShoppingBag className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">{t("rewards.noRedemptionsYet")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {redemptions.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex items-center justify-between py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{r.userName}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="font-medium">{r.rewardTitle}</span>
                <span>&middot;</span>
                <span className="flex items-center gap-0.5">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  {r.xpSpent} XP
                </span>
                <span>&middot;</span>
                <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
                {r.reviewedByName && r.reviewedAt && (
                  <>
                    <span>&middot;</span>
                    <span>
                      {t("rewards.reviewedBy")} {r.reviewedByName}
                    </span>
                  </>
                )}
              </div>
              {r.rejectReason && (
                <p className="text-xs text-destructive mt-1">
                  {t("rewards.rejectReason")}: {r.rejectReason}
                </p>
              )}
            </div>
            {r.status === "PENDING" && (
              <div className="flex items-center gap-1 shrink-0">
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
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
