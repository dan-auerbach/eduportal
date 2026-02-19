"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Reply, Loader2 } from "lucide-react";
import { commentOnSuggestion } from "@/actions/suggestions";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export type CommentData = {
  id: string;
  body: string;
  authorName: string;
  authorInitials: string;
  createdAt: string;
  replies: CommentData[];
};

type CommentThreadProps = {
  suggestionId: string;
  comments: CommentData[];
  className?: string;
};

// ── Comment Composer ─────────────────────────────────────────────────────────

function CommentComposer({
  suggestionId,
  parentId,
  onSubmitted,
  onCancel,
  placeholder = "Napišite komentar...",
}: {
  suggestionId: string;
  parentId?: string;
  onSubmitted?: (comment: CommentData) => void;
  onCancel?: () => void;
  placeholder?: string;
}) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!body.trim()) return;

    startTransition(async () => {
      const result = await commentOnSuggestion(suggestionId, {
        body: body.trim(),
        parentId: parentId ?? null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Napaka");
        return;
      }
      setBody("");
      const dto = result.data;
      const initials = dto.authorName
        .split(" ")
        .map((w) => w[0] ?? "")
        .join("")
        .toUpperCase()
        .slice(0, 2);
      onSubmitted?.({
        id: dto.id,
        body: dto.body,
        authorName: dto.authorName,
        authorInitials: initials,
        createdAt: dto.createdAt,
        replies: [],
      });
      toast.success("Komentar dodan");
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={1000}
        className="resize-none text-sm"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !body.trim()}>
          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Objavi
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Prekliči
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Single Comment ───────────────────────────────────────────────────────────

function CommentItem({
  comment,
  suggestionId,
  depth = 0,
}: {
  comment: CommentData;
  suggestionId: string;
  depth?: number;
}) {
  const [showReply, setShowReply] = useState(false);
  const [replies, setReplies] = useState(comment.replies);
  const date = new Date(comment.createdAt);

  return (
    <div
      className={cn(
        "space-y-2",
        depth > 0 && "ml-6 border-l-2 border-muted pl-4",
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-xs">{comment.authorInitials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.authorName}</span>
            <time className="text-xs text-muted-foreground" dateTime={comment.createdAt}>
              {date.toLocaleDateString("sl-SI", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
          <p className="mt-0.5 text-sm text-foreground whitespace-pre-wrap">{comment.body}</p>
          {depth < 3 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowReply(!showReply)}
            >
              <Reply className="mr-1 h-3 w-3" />
              Odgovori
            </Button>
          )}
        </div>
      </div>

      {showReply && (
        <div className="ml-9">
          <CommentComposer
            suggestionId={suggestionId}
            parentId={comment.id}
            placeholder="Napišite odgovor..."
            onCancel={() => setShowReply(false)}
            onSubmitted={(newComment) => {
              setReplies((prev) => [...prev, newComment]);
              setShowReply(false);
            }}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className="space-y-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              suggestionId={suggestionId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Thread ──────────────────────────────────────────────────────────────

export function CommentThread({ suggestionId, comments: initialComments, className }: CommentThreadProps) {
  const [comments, setComments] = useState(initialComments);

  return (
    <div data-slot="comment-thread" className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        <h3 className="text-lg font-semibold">
          Komentarji ({comments.length})
        </h3>
      </div>

      <CommentComposer
        suggestionId={suggestionId}
        onSubmitted={(newComment) => setComments((prev) => [...prev, newComment])}
      />

      {comments.length > 0 ? (
        <div className="space-y-4 pt-2">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              suggestionId={suggestionId}
            />
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Še ni komentarjev. Bodite prvi!
        </p>
      )}
    </div>
  );
}
