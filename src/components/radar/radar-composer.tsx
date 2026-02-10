"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { createRadarPost, checkDuplicateRadarUrl } from "@/actions/radar";

/**
 * RadarComposer — inline sticky input bar for adding Radar posts.
 * Desktop: always visible at the top of the feed, no modal.
 * Two fields: URL (required) + description (optional).
 * Enter in URL field focuses description. Enter in description submits.
 */
export function RadarComposer() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [dupWarn, setDupWarn] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function reset() {
    setUrl("");
    setDescription("");
    setDupWarn(false);
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;

    startTransition(async () => {
      // Duplicate check (first time only)
      if (!dupWarn && url.trim()) {
        const dupResult = await checkDuplicateRadarUrl(url.trim());
        if (dupResult.success && dupResult.data.isDuplicate) {
          setDupWarn(true);
          toast.warning(t("radar.duplicateWarning"));
          return;
        }
      }

      const result = await createRadarPost({
        url: url.trim(),
        description: description.trim(),
      });

      if (result.success) {
        toast.success(t("radar.composerApprovedToast"));
        reset();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleUrlKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (url.trim()) {
        descRef.current?.focus();
      }
    }
  }

  function handleDescKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter or Enter (without shift) submits
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-lg border border-border/60 bg-card p-4 sticky top-0 z-10 shadow-sm"
    >
      <div className="flex items-center gap-3">
        {/* URL input */}
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setDupWarn(false);
          }}
          onKeyDown={handleUrlKeyDown}
          placeholder={t("radar.composerUrlPlaceholder")}
          required
          className="flex-1 min-w-0 bg-transparent text-base placeholder:text-muted-foreground/40 outline-none"
          disabled={isPending}
        />
        {/* Submit button */}
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="shrink-0 rounded-md bg-primary text-primary-foreground p-2 disabled:opacity-40 hover:bg-primary/90 transition-colors"
          title={t("radar.addPost")}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
      {/* Description — expands when URL has content */}
      {url.trim().length > 0 && (
        <textarea
          ref={descRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleDescKeyDown}
          placeholder={t("radar.composerDescPlaceholder")}
          maxLength={600}
          rows={2}
          className="mt-3 w-full resize-none bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 outline-none leading-relaxed"
          disabled={isPending}
        />
      )}
      {dupWarn && (
        <p className="mt-1.5 text-xs text-yellow-600">
          {t("radar.duplicateWarning")}
        </p>
      )}
    </form>
  );
}
