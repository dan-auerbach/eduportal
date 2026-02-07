"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startImpersonation } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LogIn } from "lucide-react";
import { t } from "@/lib/i18n";

interface ImpersonateButtonProps {
  tenantId: string;
  tenantName: string;
}

export function ImpersonateButton({ tenantId, tenantName }: ImpersonateButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleImpersonate = async () => {
    setLoading(true);
    const result = await startImpersonation(tenantId);
    if (result.success) {
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.error(result.error);
      setLoading(false);
    }
  };

  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleImpersonate}
      disabled={loading}
    >
      <LogIn className="mr-1 h-3.5 w-3.5" />
      {loading ? t("common.loading") : t("owner.enter")}
    </Button>
  );
}
