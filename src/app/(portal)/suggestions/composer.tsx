"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Lightbulb, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { createSuggestion } from "@/actions/suggestions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

export function SuggestionComposer() {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit() {
    if (!title.trim() || !description.trim()) return;

    startTransition(async () => {
      const result = await createSuggestion({
        title: title.trim(),
        description: description.trim(),
        link: link.trim() || null,
        isAnonymous,
      });
      if (result.success) {
        toast.success(t("suggestions.createSuccess"));
        setTitle("");
        setDescription("");
        setLink("");
        setIsAnonymous(false);
        setIsOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            {t("suggestions.newSuggestion")}
          </CardTitle>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sg-title">{t("suggestions.titleField")}</Label>
            <Input
              id="sg-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("suggestions.titlePlaceholder")}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-desc">{t("suggestions.descriptionField")}</Label>
            <Textarea
              id="sg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("suggestions.descriptionPlaceholder")}
              rows={3}
              maxLength={2000}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sg-link">{t("suggestions.linkField")}</Label>
            <Input
              id="sg-link"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="sg-anon"
              checked={isAnonymous}
              onCheckedChange={(val) => setIsAnonymous(!!val)}
            />
            <Label htmlFor="sg-anon" className="text-sm">
              {t("suggestions.anonymous")}
            </Label>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !title.trim() || description.trim().length < 10}
          >
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("suggestions.submit")}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
