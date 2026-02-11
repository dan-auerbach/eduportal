"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { createRadarPost, checkDuplicateRadarUrl } from "@/actions/radar";

/**
 * RadarComposer — compact inline input for adding Radar posts.
 * X-style: single line URL → expand description on focus.
 */
export function RadarComposer() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [dupWarn, setDupWarn] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  function reset() {
    setUrl("");
    setDescription("");
    setDupWarn(false);
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;

    startTransition(async () => {
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-b border-border pb-3"
    >
      <div className="flex items-center gap-2">
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
          className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/40 outline-none py-2"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !url.trim()}
          className="shrink-0 rounded-full bg-primary text-primary-foreground p-1.5 disabled:opacity-30 hover:bg-primary/90 transition-colors"
          title={t("radar.addPost")}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {url.trim().length > 0 && (
        <textarea
          ref={descRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleDescKeyDown}
          placeholder={t("radar.composerDescPlaceholder")}
          maxLength={600}
          rows={2}
          className="mt-1 w-full resize-none bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/40 outline-none leading-relaxed"
          disabled={isPending}
        />
      )}
      {dupWarn && (
        <p className="mt-1 text-xs text-yellow-600">
          {t("radar.duplicateWarning")}
        </p>
      )}
    </form>
  );
}
