"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Zap } from "lucide-react";
import { t } from "@/lib/i18n";
import type { RedemptionStatus } from "@/generated/prisma/client";

type Redemption = {
  id: string;
  rewardTitle: string;
  xpSpent: number;
  status: RedemptionStatus;
  createdAt: string;
  rejectReason: string | null;
};

const STATUS_VARIANT: Record<RedemptionStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  APPROVED: "default",
  REJECTED: "destructive",
  CANCELLED: "outline",
};

const STATUS_LABEL: Record<RedemptionStatus, string> = {
  PENDING: "V obdelavi",
  APPROVED: "Odobreno",
  REJECTED: "Zavrnjeno",
  CANCELLED: "Preklicano",
};

type RedemptionHistoryProps = {
  redemptions: Redemption[];
};

export function RedemptionHistory({ redemptions }: RedemptionHistoryProps) {
  return (
    <div className="space-y-2">
      {redemptions.map((r) => {
        const date = new Date(r.createdAt);
        return (
          <Card key={r.id}>
            <CardContent className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.rewardTitle}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Zap className="h-3 w-3 text-yellow-500" />
                    -{r.xpSpent}
                  </span>
                  <span>&middot;</span>
                  <time dateTime={r.createdAt}>
                    {date.toLocaleDateString("sl-SI", { day: "numeric", month: "short", year: "numeric" })}
                  </time>
                </div>
                {r.rejectReason && (
                  <p className="mt-1 text-xs text-destructive">{r.rejectReason}</p>
                )}
              </div>
              <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
