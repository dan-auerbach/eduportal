"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { switchTenant } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface SelectTenantButtonProps {
  tenantId: string;
}

export function SelectTenantButton({ tenantId }: SelectTenantButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSelect = async () => {
    setLoading(true);
    const result = await switchTenant(tenantId);
    if (result.success) {
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.error(result.error);
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSelect} disabled={loading} className="w-full">
      {loading ? t("common.loading") : t("tenant.select")}
    </Button>
  );
}
