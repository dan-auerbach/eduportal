"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGroup } from "@/actions/groups";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";

export function CreateGroupDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      color: (formData.get("color") as string) || undefined,
    };

    const result = await createGroup(data);

    if (result.success) {
      toast.success(t("admin.groups.groupCreated"));
      setOpen(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("admin.groups.createGroup")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.groups.createGroup")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("admin.groups.groupName")}</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("admin.groups.description")}</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              placeholder={t("admin.groups.optionalDescription")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">{t("admin.groups.color")}</Label>
            <div className="flex items-center gap-3">
              <Input
                id="color"
                name="color"
                type="color"
                className="h-10 w-16 cursor-pointer p-1"
                defaultValue="#6366f1"
              />
              <span className="text-sm text-muted-foreground">
                {t("admin.groups.chooseColor")}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("common.creating") : t("admin.groups.createGroup")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
