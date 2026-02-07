"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { startImpersonation } from "@/actions/tenants";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LogIn,
  MoreHorizontal,
  Pencil,
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

interface TenantActionsProps {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  isArchived: boolean;
}

export function TenantActions({
  tenantId,
  tenantName,
  tenantSlug,
  isArchived,
}: TenantActionsProps) {
  const router = useRouter();

  // Impersonation state
  const [impersonating, setImpersonating] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteSlugInput, setDeleteSlugInput] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ── Impersonation ──────────────────────────────────────────
  async function handleImpersonate() {
    setImpersonating(true);
    const result = await startImpersonation(tenantId);
    if (result.success) {
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.error(result.error);
      setImpersonating(false);
    }
  }

  // ── Export ─────────────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/owner/tenants/${tenantId}/export`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        `backup-${tenantSlug}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("owner.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────
  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/owner/tenants/${tenantId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmSlug: deleteSlugInput }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      toast.success(t("owner.tenantDeleted"));
      setDeleteOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("owner.deleteFailed"),
      );
    } finally {
      setDeleting(false);
    }
  }

  function resetDeleteDialog() {
    setDeleteConfirmed(false);
    setDeleteSlugInput("");
    setDeleting(false);
  }

  const canDelete = deleteConfirmed && deleteSlugInput === tenantSlug;

  return (
    <>
      {/* Enter button (prominent) */}
      {!isArchived && (
        <Button
          variant="default"
          size="sm"
          onClick={handleImpersonate}
          disabled={impersonating}
        >
          <LogIn className="mr-1 h-3.5 w-3.5" />
          {impersonating ? t("common.loading") : t("owner.enter")}
        </Button>
      )}

      {/* More actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/owner/tenants/${tenantId}`}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("common.edit")}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleExport} disabled={exporting}>
            <Download className="mr-2 h-4 w-4" />
            {exporting ? t("owner.exporting") : t("owner.exportBackup")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              resetDeleteDialog();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("owner.permanentDelete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) resetDeleteDialog();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("owner.deleteTitle")}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("owner.deleteWarning", { name: tenantName })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warning */}
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t("owner.deleteWarning", { name: tenantName })}
              </AlertDescription>
            </Alert>

            {/* Checkbox */}
            <div className="flex items-start gap-3">
              <Checkbox
                id="delete-confirm"
                checked={deleteConfirmed}
                onCheckedChange={(checked) =>
                  setDeleteConfirmed(checked === true)
                }
              />
              <Label htmlFor="delete-confirm" className="text-sm leading-snug">
                {t("owner.deleteConfirmCheckbox")}
              </Label>
            </div>

            {/* Slug input */}
            <div className="space-y-2">
              <Label htmlFor="delete-slug" className="text-sm">
                {t("owner.deleteConfirmSlug")}
              </Label>
              <Input
                id="delete-slug"
                placeholder={tenantSlug}
                value={deleteSlugInput}
                onChange={(e) => setDeleteSlugInput(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Optional: download backup first */}
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="text-sm text-primary hover:underline"
            >
              <Download className="inline mr-1 h-3.5 w-3.5" />
              {exporting ? t("owner.exporting") : t("owner.deleteFirst")}
            </button>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!canDelete || deleting}
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleting ? t("owner.deleting") : t("owner.deleteButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
