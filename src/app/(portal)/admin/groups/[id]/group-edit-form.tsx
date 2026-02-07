"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGroup } from "@/actions/groups";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/lib/i18n";

interface GroupEditFormProps {
  groupId: string;
  defaultValues: {
    name: string;
    description: string;
    color: string;
  };
}

export function GroupEditForm({ groupId, defaultValues }: GroupEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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

  return (
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
  );
}
