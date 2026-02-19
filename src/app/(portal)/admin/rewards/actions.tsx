"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Pencil, Loader2 } from "lucide-react";
import { createReward, updateReward } from "@/actions/rewards";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type AdminRewardActionsProps =
  | { mode: "create"; rewardId?: never }
  | { mode: "edit"; rewardId: string };

export function AdminRewardActions({ mode, rewardId }: AdminRewardActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [costXp, setCostXp] = useState(100);
  const [monthlyLimit, setMonthlyLimit] = useState<number | null>(null);
  const [quantityAvailable, setQuantityAvailable] = useState<number | null>(null);
  const [approvalRequired, setApprovalRequired] = useState(true);
  const [active, setActive] = useState(true);

  function handleSubmit() {
    if (!title.trim()) return;

    startTransition(async () => {
      const data = {
        title: title.trim(),
        description: description.trim() || undefined,
        costXp,
        monthlyLimit,
        quantityAvailable,
        approvalRequired,
        active,
      };

      const result =
        mode === "create"
          ? await createReward(data)
          : await updateReward(rewardId!, data);

      if (result.success) {
        toast.success(mode === "create" ? t("rewards.created") : t("rewards.updated"));
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
        {mode === "create" ? (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            {t("rewards.create")}
          </Button>
        ) : (
          <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? t("rewards.create") : t("rewards.edit")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("rewards.titleField")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("rewards.descriptionField")}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t("rewards.costXp")}</Label>
              <Input
                type="number"
                min={1}
                value={costXp}
                onChange={(e) => setCostXp(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("rewards.monthlyLimit")}</Label>
              <Input
                type="number"
                min={1}
                value={monthlyLimit ?? ""}
                onChange={(e) =>
                  setMonthlyLimit(e.target.value ? Number(e.target.value) : null)
                }
                placeholder={t("rewards.unlimited")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("rewards.stock")}</Label>
            <Input
              type="number"
              min={1}
              value={quantityAvailable ?? ""}
              onChange={(e) =>
                setQuantityAvailable(e.target.value ? Number(e.target.value) : null)
              }
              placeholder={t("rewards.unlimited")}
            />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="approval"
                checked={approvalRequired}
                onCheckedChange={(val) => setApprovalRequired(!!val)}
              />
              <Label htmlFor="approval" className="text-sm">
                {t("rewards.approvalRequired")}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="active"
                checked={active}
                onCheckedChange={(val) => setActive(!!val)}
              />
              <Label htmlFor="active" className="text-sm">
                {t("rewards.active")}
              </Label>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={isPending || !title.trim()} className="w-full">
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {mode === "create" ? t("rewards.create") : t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
