"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, User, Flame, Sparkles } from "lucide-react";
import { VoteButton } from "./vote-button";
import Link from "next/link";
import { t } from "@/lib/i18n";
import type { SuggestionStatus } from "@/generated/prisma/client";

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  OPEN: { label: "Odprto", variant: "secondary" },
  APPROVED: { label: "Odobreno", variant: "default" },
  REJECTED: { label: "Zavrnjeno", variant: "destructive" },
  CONVERTED: { label: "Pretvorjeno", variant: "outline" },
};

// ── Types ────────────────────────────────────────────────────────────────────

type SuggestionCardProps = {
  id: string;
  title: string;
  authorName: string | null; // null = anonymous
  status: SuggestionStatus;
  voteCount: number;
  commentCount: number;
  hasVoted: boolean;
  createdAt: string;
  className?: string;
  /** XP amount for creating a suggestion (from tenant config) */
  xpCreated?: number;
  /** XP amount for popular suggestion (from tenant config) */
  xpTop?: number;
  /** Vote threshold for "popular" badge (from tenant config) */
  voteThreshold?: number;
};

// ── Component ────────────────────────────────────────────────────────────────

export function SuggestionCard({
  id,
  title,
  authorName,
  status,
  voteCount,
  commentCount,
  hasVoted,
  createdAt,
  className,
  xpCreated = 10,
  xpTop = 75,
  voteThreshold = 5,
}: SuggestionCardProps) {
  const statusConfig = STATUS_CONFIG[status];
  const date = new Date(createdAt);
  const isPopular = voteCount >= voteThreshold;

  return (
    <Card
      data-slot="suggestion-card"
      className={cn("transition-shadow hover:shadow-md", className)}
    >
      <CardContent className="flex items-center gap-4 py-3">
        {/* Vote button (left) */}
        <VoteButton
          suggestionId={id}
          voteCount={voteCount}
          hasVoted={hasVoted}
        />

        {/* Content (center) */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/suggestions/${id}`}
              className="text-sm font-semibold leading-tight hover:underline line-clamp-1"
            >
              {title}
            </Link>
            {isPopular && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Flame className="h-2.5 w-2.5" />
                {t("suggestions.popularBadge", { xp: String(xpTop) })}
              </span>
            )}
            <Badge variant={statusConfig.variant} className="shrink-0 text-[10px]">
              {statusConfig.label}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{authorName ?? "Anonimno"}</span>
            </div>
            <span>&middot;</span>
            <time dateTime={createdAt}>
              {date.toLocaleDateString("sl-SI", { day: "numeric", month: "short", year: "numeric" })}
            </time>
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Sparkles className="h-2.5 w-2.5" />
              {t("suggestions.authorXp", { xp: String(xpCreated) })}
            </span>
          </div>
        </div>

        {/* Comments (right) */}
        <Link
          href={`/suggestions/${id}`}
          className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <MessageSquare className="h-4 w-4" />
          <span className="tabular-nums">{commentCount}</span>
        </Link>
      </CardContent>
    </Card>
  );
}
