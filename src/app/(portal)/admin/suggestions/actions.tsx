"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Check, X, BookOpen, Loader2, Trash2 } from "lucide-react";
import { updateSuggestionStatus, convertSuggestionToModule, deleteSuggestion } from "@/actions/suggestions";
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

  function handleDelete() {
    if (!confirm(t("suggestions.deleteConfirm"))) return;
    startTransition(async () => {
      const result = await deleteSuggestion(suggestionId);
      if (result.success) {
        toast.success(t("suggestions.deleted"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // CONVERTED status — no actions (module already exists)
  if (currentStatus === "CONVERTED") {
    return null;
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
        {currentStatus === "OPEN" && (
          <>
            <DropdownMenuItem onClick={() => handleStatusChange("APPROVED")}>
              <Check className="mr-2 h-4 w-4 text-green-600" />
              {t("suggestions.approve")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleStatusChange("REJECTED")}>
              <X className="mr-2 h-4 w-4 text-red-600" />
              {t("suggestions.reject")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {currentStatus === "APPROVED" && (
          <>
            <DropdownMenuItem onClick={handleConvert}>
              <BookOpen className="mr-2 h-4 w-4" />
              {t("suggestions.convertToModule")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          {t("suggestions.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
