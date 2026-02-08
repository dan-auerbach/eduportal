"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitModuleFeedback } from "@/actions/feedback";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

type FeedbackFormProps = {
  moduleId: string;
  existingRating?: number;
  existingNote?: string;
};

export function FeedbackForm({ moduleId, existingRating, existingNote }: FeedbackFormProps) {
  const [rating, setRating] = useState(existingRating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [suggestion, setSuggestion] = useState(existingNote ?? "");
  const [submitted, setSubmitted] = useState(!!existingRating);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  if (submitted) {
    return (
      <div className="rounded-lg border border-border/50 bg-card px-6 py-5 text-center space-y-2">
        <p className="font-medium text-sm">{t("feedback.submitted")}</p>
        <div className="flex items-center justify-center gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={cn(
                "h-5 w-5",
                star <= rating
                  ? "text-amber-500 fill-amber-500"
                  : "text-muted-foreground/30"
              )}
            />
          ))}
        </div>
        {suggestion && (
          <p className="text-xs text-muted-foreground mt-1">{t("feedback.yourRating")}</p>
        )}
      </div>
    );
  }

  function handleSubmit() {
    setError("");
    if (rating === 0) {
      setError(t("feedback.ratingRequired"));
      return;
    }
    if (suggestion.length < 20) {
      setError(t("feedback.minChars"));
      return;
    }
    if (suggestion.length > 500) {
      setError(t("feedback.maxChars"));
      return;
    }

    startTransition(async () => {
      const result = await submitModuleFeedback(moduleId, rating, suggestion);
      if (result.success) {
        setSubmitted(true);
        toast.success(t("feedback.submitted"));
      } else {
        setError(result.error);
      }
    });
  }

  const displayRating = hoverRating || rating;

  return (
    <div className="rounded-lg border border-border/50 bg-card px-6 py-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-sm">{t("feedback.title")}</h3>
        <p className="text-xs text-muted-foreground">{t("feedback.subtitle")}</p>
      </div>

      {/* Star rating */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("feedback.ratingLabel")}</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-0.5 transition-transform hover:scale-110"
              disabled={isPending}
            >
              <Star
                className={cn(
                  "h-7 w-7 transition-colors",
                  star <= displayRating
                    ? "text-amber-500 fill-amber-500"
                    : "text-muted-foreground/30 hover:text-amber-300"
                )}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion textarea */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("feedback.suggestionLabel")}</label>
        <textarea
          value={suggestion}
          onChange={(e) => setSuggestion(e.target.value)}
          placeholder={t("feedback.suggestionPlaceholder")}
          rows={3}
          maxLength={500}
          disabled={isPending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {suggestion.length}/500
          </span>
          {suggestion.length > 0 && suggestion.length < 20 && (
            <span className="text-[11px] text-amber-600">
              {t("feedback.minChars")}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isPending || rating === 0}
        size="sm"
        className="w-full"
      >
        {isPending ? "..." : t("feedback.submit")}
      </Button>
    </div>
  );
}
