"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

export function DeleteUpdateButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    if (!confirm(t("updates.confirmDelete"))) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/updates?id=${entryId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        toast.success(t("updates.updateDeleted"));
        router.refresh();
      } else {
        toast.error(t("updates.deleteError"));
      }
    } catch {
      toast.error(t("updates.deleteError"));
    }
    setDeleting(false);
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-muted-foreground/50 hover:text-destructive shrink-0"
      onClick={handleDelete}
      disabled={deleting}
      title={t("updates.deleteUpdate")}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
