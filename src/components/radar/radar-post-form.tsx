"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Radar } from "lucide-react";
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

export function CreateRadarPostDialog({ isAdmin }: { isAdmin?: boolean }) {
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
      description: (formData.get("description") as string) || "",
      url,
    };

    startTransition(async () => {
      // Check for duplicate URL (only if not already confirmed)
      if (!confirmedDuplicate && url) {
        const dupResult = await checkDuplicateRadarUrl(url);
        if (dupResult.success && dupResult.data.isDuplicate) {
          setDuplicateWarn(dupResult.data.existingDomain || "");
          setConfirmedDuplicate(true);
          return;
        }
      }

      const result = await createRadarPost(data);
      if (result.success) {
        toast.success(isAdmin ? t("radar.postCreatedApproved") : t("radar.postCreated"));
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
          <Radar className="mr-2 h-4 w-4" />
          {t("radar.addPost")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("radar.addPost")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {duplicateWarn && (
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              {t("radar.duplicateWarning")}
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
