"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { reassignExpiredModule } from "@/actions/compliance";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type ReassignButtonProps = {
  userId: string;
  moduleId: string;
};

export function ReassignButton({ userId, moduleId }: ReassignButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReassign() {
    startTransition(async () => {
      const result = await reassignExpiredModule(userId, moduleId);
      if (result.success) {
        toast.success(t("compliance.reassigned"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleReassign}
    >
      {isPending ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-1 h-4 w-4" />
      )}
      {t("compliance.reassign")}
    </Button>
  );
}
