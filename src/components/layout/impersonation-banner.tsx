"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { stopImpersonation } from "@/actions/tenants";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

export function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  const router = useRouter();

  const handleExit = async () => {
    await stopImpersonation();
    router.push("/owner");
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between bg-amber-100 border-b border-amber-300 px-3 md:px-4 py-2 text-amber-900 text-sm gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="truncate">
          {t("owner.impersonatingPrefix")} <strong>{tenantName}</strong> <span className="hidden sm:inline">{t("owner.impersonatingSuffix")}</span>
        </span>
      </div>
      <Button variant="outline" size="sm" onClick={handleExit} className="border-amber-400 text-amber-900 hover:bg-amber-200 shrink-0">
        {t("owner.exitImpersonation")}
      </Button>
    </div>
  );
}
