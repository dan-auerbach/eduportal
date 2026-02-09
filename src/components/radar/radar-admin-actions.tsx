"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Archive, Pin, PinOff, Bookmark } from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  approveRadarPost,
  rejectRadarPost,
  archiveRadarPost,
  pinRadarPost,
  unpinRadarPost,
  toggleRadarSave,
} from "@/actions/radar";

// ── Approve ──────────────────────────────────────────────────────────────────

export function ApproveRadarButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      const result = await approveRadarPost(postId);
      if (result.success) {
        toast.success(t("radar.postApproved"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      size="sm"
      onClick={handleApprove}
      disabled={isPending}
      className="bg-green-600 hover:bg-green-700 h-7 text-xs px-2"
    >
      <Check className="mr-1 h-3.5 w-3.5" />
      {t("radar.approve")}
    </Button>
  );
}

// ── Reject ───────────────────────────────────────────────────────────────────

export function RejectRadarDialog({ postId }: { postId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const reason = (formData.get("reason") as string) || "";

    startTransition(async () => {
      const result = await rejectRadarPost(postId, { reason });
      if (result.success) {
        toast.success(t("radar.postRejected"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive" className="h-7 text-xs px-2">
          <X className="mr-1 h-3.5 w-3.5" />
          {t("radar.reject")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("radar.rejectTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reject-reason">
              {t("radar.rejectReasonField")}
            </Label>
            <Textarea
              id="reject-reason"
              name="reason"
              required
              maxLength={200}
              rows={3}
              placeholder={t("radar.rejectReasonPlaceholder")}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              {isPending ? t("common.saving") : t("radar.reject")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Archive ──────────────────────────────────────────────────────────────────

export function ArchiveRadarButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      const result = await archiveRadarPost(postId);
      if (result.success) {
        toast.success(t("radar.postArchived"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleArchive} disabled={isPending} className="h-7 text-xs px-2">
      <Archive className="mr-1 h-3.5 w-3.5" />
      {t("radar.archive")}
    </Button>
  );
}

// ── Pin / Unpin ──────────────────────────────────────────────────────────────

export function PinRadarToggle({
  postId,
  pinned,
}: {
  postId: string;
  pinned: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = pinned
        ? await unpinRadarPost(postId)
        : await pinRadarPost(postId);
      if (result.success) {
        toast.success(pinned ? t("radar.postUnpinned") : t("radar.postPinned"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={handleToggle} disabled={isPending} className="h-7 text-xs px-2">
      {pinned ? (
        <>
          <PinOff className="mr-1 h-3.5 w-3.5" />
          {t("radar.unpin")}
        </>
      ) : (
        <>
          <Pin className="mr-1 h-3.5 w-3.5" />
          {t("radar.pin")}
        </>
      )}
    </Button>
  );
}

// ── Save / Unsave (personal bookmark) ────────────────────────────────────────

export function SaveRadarToggle({
  postId,
  saved,
}: {
  postId: string;
  saved: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleRadarSave(postId);
      if (result.success) {
        toast.success(result.data.saved ? t("radar.postSaved") : t("radar.postUnsaved"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={handleToggle}
      disabled={isPending}
      className="h-7 w-7"
      title={saved ? t("radar.unsave") : t("radar.save")}
    >
      <Bookmark
        className={`h-3.5 w-3.5 ${saved ? "fill-primary text-primary" : ""}`}
      />
    </Button>
  );
}
