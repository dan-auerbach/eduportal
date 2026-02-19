"use client";

import { cn } from "@/lib/utils";
import { Zap, Wallet } from "lucide-react";
import { RankBadge } from "./rank-badge";
import type { ReputationRank } from "@/generated/prisma/client";

type XpDisplayProps = {
  lifetimeXp: number;
  spendableXp: number;
  rank: ReputationRank;
  nextRank?: { nextRank: ReputationRank; xpNeeded: number } | null;
  variant?: "compact" | "full";
  className?: string;
};

export function XpDisplay({
  lifetimeXp,
  spendableXp,
  rank,
  nextRank,
  variant = "compact",
  className,
}: XpDisplayProps) {
  if (variant === "compact") {
    return (
      <div
        data-slot="xp-display"
        className={cn("inline-flex items-center gap-1.5", className)}
      >
        <Zap className="h-4 w-4 text-yellow-500" />
        <span className="text-sm font-semibold tabular-nums">{lifetimeXp.toLocaleString()}</span>
        <RankBadge rank={rank} size="sm" showLabel={false} />
      </div>
    );
  }

  // Full variant with progress bar
  return (
    <div data-slot="xp-display" className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          <span className="text-lg font-bold tabular-nums">{lifetimeXp.toLocaleString()} XP</span>
        </div>
        <RankBadge rank={rank} size="md" />
      </div>

      {/* Spendable balance */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Wallet className="h-4 w-4" />
        <span>Na voljo za nagrade: <strong className="text-foreground tabular-nums">{spendableXp.toLocaleString()} XP</strong></span>
      </div>

      {nextRank && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Naslednji rang: {nextRank.nextRank}</span>
            <span>{nextRank.xpNeeded.toLocaleString()} XP</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 transition-all"
              style={{
                width: `${Math.max(5, 100 - (nextRank.xpNeeded / (lifetimeXp + nextRank.xpNeeded)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
