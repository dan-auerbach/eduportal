"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voteSuggestion } from "@/actions/suggestions";
import { toast } from "sonner";

type VoteButtonProps = {
  suggestionId: string;
  voteCount: number;
  hasVoted: boolean;
  className?: string;
};

export function VoteButton({
  suggestionId,
  voteCount: initialCount,
  hasVoted: initialHasVoted,
  className,
}: VoteButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [hasVoted, setHasVoted] = useState(initialHasVoted);
  const [voteCount, setVoteCount] = useState(initialCount);

  function handleVote() {
    // Optimistic update
    const wasVoted = hasVoted;
    setHasVoted(!wasVoted);
    setVoteCount((prev) => (wasVoted ? prev - 1 : prev + 1));

    startTransition(async () => {
      const result = await voteSuggestion(suggestionId);
      if (!result.success) {
        // Revert optimistic update
        setHasVoted(wasVoted);
        setVoteCount((prev) => (wasVoted ? prev + 1 : prev - 1));
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      data-slot="vote-button"
      variant={hasVoted ? "default" : "outline"}
      size="sm"
      onClick={handleVote}
      disabled={isPending}
      className={cn(
        "gap-1.5 transition-colors",
        hasVoted && "bg-blue-600 hover:bg-blue-700 text-white",
        className,
      )}
    >
      <ThumbsUp className={cn("h-4 w-4", hasVoted && "fill-current")} />
      <span className="tabular-nums">{voteCount}</span>
    </Button>
  );
}
