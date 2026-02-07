"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantPermission, revokePermission } from "@/actions/users";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Permission } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";

function getPermissionLabel(permission: Permission): string {
  return t(`permissions.${permission}`);
}

interface UserPermissionsPanelProps {
  userId: string;
  allPermissions: Permission[];
  currentPermissions: Permission[];
}

export function UserPermissionsPanel({
  userId,
  allPermissions,
  currentPermissions,
}: UserPermissionsPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Set<Permission>>(
    new Set(currentPermissions)
  );

  async function handleToggle(permission: Permission, checked: boolean) {
    setPending(permission);

    if (checked) {
      const result = await grantPermission(userId, permission);
      if (result.success) {
        setPermissions((prev) => new Set([...prev, permission]));
        toast.success(t("permissions.permissionGranted", { permission: getPermissionLabel(permission) }));
      } else {
        toast.error(result.error);
      }
    } else {
      const result = await revokePermission(userId, permission);
      if (result.success) {
        setPermissions((prev) => {
          const next = new Set(prev);
          next.delete(permission);
          return next;
        });
        toast.success(t("permissions.permissionRevoked", { permission: getPermissionLabel(permission) }));
      } else {
        toast.error(result.error);
      }
    }

    setPending(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {allPermissions.map((permission) => (
        <div
          key={permission}
          className="flex items-center justify-between rounded-md border p-3"
        >
          <Label htmlFor={permission} className="cursor-pointer text-sm">
            {getPermissionLabel(permission)}
          </Label>
          <Switch
            id={permission}
            checked={permissions.has(permission)}
            disabled={pending === permission}
            onCheckedChange={(checked) => handleToggle(permission, checked)}
          />
        </div>
      ))}
    </div>
  );
}
