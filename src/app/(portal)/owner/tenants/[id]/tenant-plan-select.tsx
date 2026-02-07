"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeTenantPlan } from "@/actions/tenants";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { t } from "@/lib/i18n";
import type { TenantPlan } from "@/generated/prisma/client";

interface TenantPlanSelectProps {
  tenantId: string;
  currentPlan: TenantPlan;
}

export function TenantPlanSelect({ tenantId, currentPlan }: TenantPlanSelectProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handlePlanChange = async (newPlan: string) => {
    if (newPlan === currentPlan) return;
    setLoading(true);

    const result = await changeTenantPlan(tenantId, newPlan);

    if (result.success) {
      toast.success(t("tenant.updated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  };

  return (
    <Select defaultValue={currentPlan} onValueChange={handlePlanChange} disabled={loading}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="FREE">{t("plan.free")}</SelectItem>
        <SelectItem value="STARTER">{t("plan.starter")}</SelectItem>
        <SelectItem value="PRO">{t("plan.pro")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
