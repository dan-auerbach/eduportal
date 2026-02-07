"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGroup, deleteGroup } from "@/actions/groups";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";

interface GroupEditFormProps {
  groupId: string;
  groupName: string;
  defaultValues: {
    name: string;
    description: string;
    color: string;
  };
}

export function GroupEditForm({ groupId, groupName, defaultValues }: GroupEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      color: (formData.get("color") as string) || null,
    };

    const result = await updateGroup(groupId, data);

    if (result.success) {
      toast.success(t("admin.groups.groupUpdated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  async function handleDelete() {
    setDeleting(true);

    const result = await deleteGroup(groupId);

    if (result.success) {
      toast.success(t("admin.groups.groupDeleted"));
      router.push("/admin/groups");
      router.refresh();
    } else {
      toast.error(result.error);
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t("admin.groups.groupName")}</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaultValues.name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">{t("admin.groups.description")}</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={defaultValues.description}
            rows={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="color">{t("admin.groups.color")}</Label>
          <Input
            id="color"
            name="color"
            type="color"
            className="h-10 w-16 cursor-pointer p-1"
            defaultValue={defaultValues.color}
          />
        </div>
        <Button type="submit" disabled={loading}>
          {loading ? t("common.saving") : t("admin.users.saveChanges")}
        </Button>
      </form>

      <Separator />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2">
            <Trash2 className="h-4 w-4" />
            {t("admin.groups.deleteGroup")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.groups.deleteGroup")}</DialogTitle>
            <DialogDescription>
              {t("admin.groups.deleteGroupConfirm")}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-sm font-medium">{groupName}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? t("admin.groups.deleting") : t("admin.groups.deleteGroup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
