"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeTenantMember, updateTenantMemberRole } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import type { TenantRole } from "@/generated/prisma/client";

interface MemberRoleSelectProps {
  tenantId: string;
  userId: string;
  currentRole: TenantRole;
}

export function MemberRoleSelect({ tenantId, userId, currentRole }: MemberRoleSelectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRoleChange = async (newRole: string) => {
    if (newRole === currentRole) return;
    setLoading(true);
    const result = await updateTenantMemberRole(tenantId, userId, newRole);
    if (result.success) {
      toast.success(t("tenant.updated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <Select defaultValue={currentRole} onValueChange={handleRoleChange} disabled={loading}>
      <SelectTrigger className="w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="SUPER_ADMIN">{t("tenantRoles.SUPER_ADMIN")}</SelectItem>
        <SelectItem value="ADMIN">{t("tenantRoles.ADMIN")}</SelectItem>
        <SelectItem value="HR">{t("tenantRoles.HR")}</SelectItem>
        <SelectItem value="EMPLOYEE">{t("tenantRoles.EMPLOYEE")}</SelectItem>
        <SelectItem value="VIEWER">{t("tenantRoles.VIEWER")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface RemoveMemberButtonProps {
  tenantId: string;
  userId: string;
}

export function RemoveMemberButton({ tenantId, userId }: RemoveMemberButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleRemove = async () => {
    setLoading(true);
    const result = await removeTenantMember(tenantId, userId);
    if (result.success) {
      toast.success(t("tenant.removeMember"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleRemove}
      disabled={loading}
      className="text-destructive hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
