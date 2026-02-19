"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, ExternalLink, User } from "lucide-react";
import { VoteButton } from "./vote-button";
import Link from "next/link";
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
  description: string;
  link?: string | null;
  authorName: string | null; // null = anonymous
  status: SuggestionStatus;
  voteCount: number;
  commentCount: number;
  hasVoted: boolean;
  createdAt: string;
  className?: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export function SuggestionCard({
  id,
  title,
  description,
  link,
  authorName,
  status,
  voteCount,
  commentCount,
  hasVoted,
  createdAt,
  className,
}: SuggestionCardProps) {
  const statusConfig = STATUS_CONFIG[status];
  const date = new Date(createdAt);

  return (
    <Card
      data-slot="suggestion-card"
      className={cn("transition-shadow hover:shadow-md", className)}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/suggestions/${id}`}
            className="text-base font-semibold leading-tight hover:underline line-clamp-2"
          >
            {title}
          </Link>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-3 w-3" />
              <span>{authorName ?? "Anonimno"}</span>
            </div>
            <span>&middot;</span>
            <time dateTime={createdAt}>
              {date.toLocaleDateString("sl-SI", { day: "numeric", month: "short", year: "numeric" })}
            </time>
          </div>
        </div>
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>

        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="h-3 w-3" />
            Povezava
          </a>
        )}

        <div className="flex items-center gap-3 pt-1">
          <VoteButton
            suggestionId={id}
            voteCount={voteCount}
            hasVoted={hasVoted}
          />
          <Link
            href={`/suggestions/${id}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="tabular-nums">{commentCount}</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
