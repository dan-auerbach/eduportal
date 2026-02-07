"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { overrideProgress } from "@/actions/progress";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";
import { t } from "@/lib/i18n";

interface OverrideProgressDialogProps {
  userId: string;
  moduleId: string;
  moduleName: string;
  hasExistingOverride: boolean;
}

export function OverrideProgressDialog({
  userId,
  moduleId,
  moduleName,
  hasExistingOverride,
}: OverrideProgressDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [allowCertificate, setAllowCertificate] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error(t("admin.override.provideReason"));
      return;
    }

    setLoading(true);

    const result = await overrideProgress(
      userId,
      moduleId,
      reason.trim(),
      allowCertificate
    );

    if (result.success) {
      toast.success(t("admin.override.overrideApplied"));
      setOpen(false);
      setReason("");
      setAllowCertificate(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldCheck className="mr-1 h-4 w-4" />
          {hasExistingOverride ? t("admin.override.updateOverride") : t("admin.override.overrideProgress")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.override.overrideFor", { name: moduleName })}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">{t("admin.override.reason")}</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t("admin.override.reasonPlaceholder")}
              required
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="allowCert" className="cursor-pointer">
              {t("admin.override.allowCertificate")}
            </Label>
            <Switch
              id="allowCert"
              checked={allowCertificate}
              onCheckedChange={setAllowCertificate}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("admin.override.overrideDescription")}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("common.applying") : t("admin.override.overrideProgress")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
