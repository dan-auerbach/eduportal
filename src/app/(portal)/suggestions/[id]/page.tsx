import { notFound } from "next/navigation";
import { t } from "@/lib/i18n";
import { getSuggestionDetail } from "@/actions/suggestions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VoteButton } from "@/components/suggestions/vote-button";
import { CommentThread, type CommentData } from "@/components/suggestions/comment-thread";
import { User, ExternalLink, ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { SuggestionStatus } from "@/generated/prisma/client";

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  OPEN: { label: "Odprto", variant: "secondary" },
  APPROVED: { label: "Odobreno", variant: "default" },
  REJECTED: { label: "Zavrnjeno", variant: "destructive" },
  CONVERTED: { label: "Pretvorjeno v modul", variant: "outline" },
};

export default async function SuggestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getSuggestionDetail(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const suggestion = result.data;
  const statusConfig = STATUS_CONFIG[suggestion.status];
  const date = new Date(suggestion.createdAt);

  // Build comment tree
  const commentMap = new Map<string, CommentData>();
  const rootComments: CommentData[] = [];

  for (const c of suggestion.comments) {
    const initials = c.authorName
      .split(" ")
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2);

    commentMap.set(c.id, {
      id: c.id,
      body: c.body,
      authorName: c.authorName,
      authorInitials: initials,
      createdAt: c.createdAt,
      replies: [],
    });
  }

  for (const c of suggestion.comments) {
    const node = commentMap.get(c.id)!;
    if (c.parentId && commentMap.has(c.parentId)) {
      commentMap.get(c.parentId)!.replies.push(node);
    } else {
      rootComments.push(node);
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/suggestions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("suggestions.backToList")}
      </Link>

      {/* Main card */}
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-bold">{suggestion.title}</h1>
            <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <User className="h-4 w-4" />
              <span>{suggestion.authorName ?? "Anonimno"}</span>
            </div>
            <span>&middot;</span>
            <time dateTime={suggestion.createdAt}>
              {date.toLocaleDateString("sl-SI", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {suggestion.description}
          </p>

          {suggestion.link && (
            <a
              href={suggestion.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              <ExternalLink className="h-4 w-4" />
              {suggestion.link}
            </a>
          )}

          <div className="pt-2">
            <VoteButton
              suggestionId={suggestion.id}
              voteCount={suggestion.voteCount}
              hasVoted={suggestion.hasVoted}
            />
          </div>
        </CardContent>
      </Card>

      {/* Comments */}
      <CommentThread
        suggestionId={suggestion.id}
        comments={rootComments}
      />
    </div>
  );
}
