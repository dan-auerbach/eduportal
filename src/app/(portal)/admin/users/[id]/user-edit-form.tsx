"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUser, deactivateUser } from "@/actions/users";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Role } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";

interface UserEditFormProps {
  userId: string;
  defaultValues: {
    firstName: string;
    lastName: string;
    email: string;
    role: Role;
    isActive: boolean;
  };
}

export function UserEditForm({ userId, defaultValues }: UserEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(defaultValues.role);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      role,
    };

    const result = await updateUser(userId, data);

    if (result.success) {
      toast.success(t("admin.users.userUpdated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  async function handleDeactivate() {
    const result = await deactivateUser(userId);
    if (result.success) {
      toast.success(t("admin.users.userDeactivated"));
      router.push("/admin/users");
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("admin.users.firstName")}</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={defaultValues.firstName}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("admin.users.lastName")}</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={defaultValues.lastName}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("admin.users.tableEmail")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultValues.email}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">{t("admin.users.tableRole")}</Label>
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger>
            <SelectValue placeholder={t("admin.users.selectRole")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="EMPLOYEE">{t("roles.EMPLOYEE")}</SelectItem>
            <SelectItem value="ADMIN">{t("roles.ADMIN")}</SelectItem>
            <SelectItem value="SUPER_ADMIN">{t("roles.SUPER_ADMIN")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? t("common.saving") : t("admin.users.saveChanges")}
        </Button>
        {defaultValues.isActive && (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDeactivate}
          >
            {t("admin.users.deactivateUser")}
          </Button>
        )}
      </div>
    </form>
  );
}
