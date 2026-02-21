"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles } from "lucide-react";
import { createSuggestion } from "@/actions/suggestions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

export function SuggestionComposer() {
  const [title, setTitle] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    if (!title.trim()) return;

    startTransition(async () => {
      const result = await createSuggestion({
        title: title.trim(),
        isAnonymous,
      });
      if (result.success) {
        toast.success(t("suggestions.createSuccess"));
        setTitle("");
        setIsAnonymous(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-amber-300/60 bg-amber-50/30 p-4 dark:border-amber-800/40 dark:bg-amber-950/10">
      <div className="flex items-center gap-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("suggestions.titlePlaceholder")}
          maxLength={200}
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <Button
          onClick={handleSubmit}
          disabled={isPending || !title.trim()}
          className="shrink-0 font-semibold"
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {t("suggestions.submit")}
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id="sg-anon"
            checked={isAnonymous}
            onCheckedChange={(val) => setIsAnonymous(!!val)}
          />
          <Label htmlFor="sg-anon" className="text-xs text-muted-foreground cursor-pointer">
            {t("suggestions.anonymous")}
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("suggestions.submitHelper")}
        </p>
      </div>
    </div>
  );
}
