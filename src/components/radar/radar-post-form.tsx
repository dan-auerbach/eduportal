"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createRadarPost, checkDuplicateRadarUrl } from "@/actions/radar";

const TAG_OPTIONS = [
  { value: "AI", label: "tagAI" },
  { value: "TECH", label: "tagTECH" },
  { value: "PRODUCTIVITY", label: "tagPRODUCTIVITY" },
  { value: "MEDIA", label: "tagMEDIA" },
  { value: "SECURITY", label: "tagSECURITY" },
] as const;

export function CreateRadarPostDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [duplicateWarn, setDuplicateWarn] = useState<string | null>(null);
  const [confirmedDuplicate, setConfirmedDuplicate] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const url = (formData.get("url") as string) || "";
    const data = {
      title: (formData.get("title") as string) || "",
      description: (formData.get("description") as string) || "",
      url,
      tag: (formData.get("tag") as string) || null,
    };

    startTransition(async () => {
      // Check for duplicate URL (only if not already confirmed)
      if (!confirmedDuplicate && url) {
        const dupResult = await checkDuplicateRadarUrl(url);
        if (dupResult.success && dupResult.data.isDuplicate) {
          setDuplicateWarn(dupResult.data.existingTitle || "");
          setConfirmedDuplicate(true);
          return;
        }
      }

      const result = await createRadarPost(data);
      if (result.success) {
        toast.success(t("radar.postCreated"));
        setOpen(false);
        setDuplicateWarn(null);
        setConfirmedDuplicate(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setDuplicateWarn(null);
      setConfirmedDuplicate(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("radar.addPost")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("radar.addPost")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="radar-title">{t("radar.titleField")}</Label>
            <Input
              id="radar-title"
              name="title"
              required
              maxLength={120}
              placeholder={t("radar.titlePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="radar-description">{t("radar.descriptionField")}</Label>
            <Textarea
              id="radar-description"
              name="description"
              required
              maxLength={600}
              rows={4}
              placeholder={t("radar.descriptionPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="radar-url">{t("radar.urlField")}</Label>
            <Input
              id="radar-url"
              name="url"
              type="url"
              required
              placeholder={t("radar.urlPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="radar-tag">{t("radar.tagField")}</Label>
            <select
              id="radar-tag"
              name="tag"
              defaultValue=""
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">{t("radar.noTag")}</option>
              {TAG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(`radar.${opt.label}`)}
                </option>
              ))}
            </select>
          </div>

          {duplicateWarn && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              {t("radar.duplicateWarning", { title: duplicateWarn })}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? t("common.creating")
                : confirmedDuplicate
                  ? t("common.save")
                  : t("radar.addPost")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
