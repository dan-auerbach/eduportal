"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Check, X, BookOpen, Loader2 } from "lucide-react";
import { updateSuggestionStatus, convertSuggestionToModule } from "@/actions/suggestions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";
import type { SuggestionStatus } from "@/generated/prisma/client";

type AdminSuggestionActionsProps = {
  suggestionId: string;
  currentStatus: SuggestionStatus;
};

export function AdminSuggestionActions({
  suggestionId,
  currentStatus,
}: AdminSuggestionActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleStatusChange(status: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const result = await updateSuggestionStatus(suggestionId, status);
      if (result.success) {
        toast.success(
          status === "APPROVED"
            ? t("suggestions.approved")
            : t("suggestions.rejected"),
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleConvert() {
    startTransition(async () => {
      const result = await convertSuggestionToModule(suggestionId);
      if (result.success) {
        toast.success(t("suggestions.converted"));
        router.push(`/admin/modules/${result.data.moduleId}/edit`);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (currentStatus !== "OPEN") {
    return currentStatus === "APPROVED" ? (
      <Button
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={handleConvert}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <BookOpen className="mr-1 h-4 w-4" />
            {t("suggestions.convertToModule")}
          </>
        )}
      </Button>
    ) : null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleStatusChange("APPROVED")}>
          <Check className="mr-2 h-4 w-4 text-green-600" />
          {t("suggestions.approve")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleStatusChange("REJECTED")}>
          <X className="mr-2 h-4 w-4 text-red-600" />
          {t("suggestions.reject")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
