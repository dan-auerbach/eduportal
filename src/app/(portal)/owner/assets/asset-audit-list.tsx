"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Loader2,
  RefreshCw,
  AlertTriangle,
  HardDrive,
  Search,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { bulkDeleteOrphanedAssets, forceDeleteAsset } from "@/actions/asset-audit";

// ── Types ────────────────────────────────────────────────────────────────────

interface AssetRow {
  id: string;
  tenantId: string;
  tenantName: string;
  type: string;
  status: string;
  provider: string;
  title: string;
  cfStreamUid: string | null;
  blobUrl: string | null;
  mimeType: string | null;
  sizeBytes: string | null;
  durationSeconds: number | null;
  createdAt: string;
  createdByName: string;
  usageCount: number;
  lastError: string | null;
  sections: { id: string; title: string; moduleTitle: string }[];
}

interface AssetAuditListProps {
  initialAssets: AssetRow[];
  tenants: { id: string; name: string }[];
}

// ── Status badges ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  PROCESSING: "bg-blue-100 text-blue-800 border-blue-200",
  READY: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
  DELETE_PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  DELETE_FAILED: "bg-red-100 text-red-800 border-red-200",
};

const TYPE_BADGE: Record<string, string> = {
  VIDEO: "bg-purple-100 text-purple-800 border-purple-200",
  DOCUMENT: "bg-orange-100 text-orange-800 border-orange-200",
};

const PROVIDER_LABEL: Record<string, string> = {
  CLOUDFLARE_STREAM: "CF Stream",
  VERCEL_BLOB: "Vercel Blob",
};

function formatBytes(bytes: string | null): string {
  if (!bytes) return "—";
  const n = parseInt(bytes, 10);
  if (isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AssetAuditList({ initialAssets, tenants }: AssetAuditListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assets, setAssets] = useState<AssetRow[]>(initialAssets);

  // Filters
  const [filterTenant, setFilterTenant] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [filterOrphaned, setFilterOrphaned] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Dialogs
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [forceDeleteOpen, setForceDeleteOpen] = useState(false);
  const [forceDeleteTarget, setForceDeleteTarget] = useState<AssetRow | null>(null);
  const [forceDeleteBusy, setForceDeleteBusy] = useState(false);

  // ── Filtering ────────────────────────────────────────────────

  const filteredAssets = assets.filter((a) => {
    if (filterTenant !== "all" && a.tenantId !== filterTenant) return false;
    if (filterType !== "all" && a.type !== filterType) return false;
    if (filterProvider !== "all" && a.provider !== filterProvider) return false;
    if (filterOrphaned && a.usageCount > 0) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !a.title.toLowerCase().includes(q) &&
        !a.tenantName.toLowerCase().includes(q) &&
        !a.createdByName.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const orphanedCount = filteredAssets.filter((a) => a.usageCount === 0).length;
  const selectedOrphaned = Array.from(selected).filter((id) => {
    const a = assets.find((x) => x.id === id);
    return a && a.usageCount === 0;
  });

  // ── Selection handlers ────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllOrphaned() {
    const orphanedIds = filteredAssets
      .filter((a) => a.usageCount === 0)
      .map((a) => a.id);
    setSelected(new Set(orphanedIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  // ── Bulk delete handler ────────────────────────────────────────

  async function handleBulkDelete() {
    setBulkDeleteBusy(true);
    const result = await bulkDeleteOrphanedAssets(selectedOrphaned);
    if (result.success) {
      const d = result.data;
      toast.success(
        `${t("owner.bulkDeleteDone")}: ${d.deleted} ${t("owner.deleted")}, ${d.failed} ${t("owner.failed")}, ${d.skipped} ${t("owner.skipped")}`,
      );
      // Remove deleted from local state
      setAssets((prev) => prev.filter((a) => !selectedOrphaned.includes(a.id) || result.data.errors.some((e) => e.includes(a.id))));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      startTransition(() => router.refresh());
    } else {
      toast.error(result.error);
    }
    setBulkDeleteBusy(false);
  }

  // ── Force delete handler ────────────────────────────────────────

  async function handleForceDelete() {
    if (!forceDeleteTarget) return;
    setForceDeleteBusy(true);
    const result = await forceDeleteAsset(forceDeleteTarget.id);
    if (result.success) {
      toast.success("✓");
      setAssets((prev) => prev.filter((a) => a.id !== forceDeleteTarget.id));
      setForceDeleteOpen(false);
      startTransition(() => router.refresh());
    } else {
      toast.error(result.error);
    }
    setForceDeleteBusy(false);
  }

  // ── Refresh ────────────────────────────────────────────────

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
      toast.success(t("owner.assetRefreshDone"));
    });
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("common.search")}
            className="pl-9 w-[220px]"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Select value={filterTenant} onValueChange={setFilterTenant}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("owner.allTenants")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("owner.allTenants")}</SelectItem>
            {tenants.map((te) => (
              <SelectItem key={te.id} value={te.id}>
                {te.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder={t("owner.filterType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("owner.filterType")}</SelectItem>
            <SelectItem value="VIDEO">Video</SelectItem>
            <SelectItem value="DOCUMENT">Document</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterProvider} onValueChange={setFilterProvider}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder={t("owner.filterProvider")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("owner.filterProvider")}</SelectItem>
            <SelectItem value="CLOUDFLARE_STREAM">CF Stream</SelectItem>
            <SelectItem value="VERCEL_BLOB">Vercel Blob</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={filterOrphaned}
            onCheckedChange={(v) => setFilterOrphaned(v === true)}
          />
          {t("owner.filterOrphaned")}
        </label>

        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
          <RefreshCw className={`mr-1 h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          {t("owner.refresh")}
        </Button>
      </div>

      {/* Stats & bulk actions */}
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">
          {filteredAssets.length} {t("owner.totalAssets")}
          {orphanedCount > 0 && (
            <span className="ml-2 text-amber-600">
              ({orphanedCount} {t("owner.orphaned")})
            </span>
          )}
        </span>

        {orphanedCount > 0 && (
          <Button variant="outline" size="sm" onClick={selectAllOrphaned}>
            {t("owner.selectAllOrphaned")}
          </Button>
        )}

        {selected.size > 0 && (
          <>
            <span className="text-sm font-medium">
              {selected.size} {t("owner.selected")}
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteOpen(true)}
              disabled={selectedOrphaned.length === 0}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {t("owner.bulkDeleteOrphaned")} ({selectedOrphaned.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              {t("common.clearAll")}
            </Button>
          </>
        )}
      </div>

      {/* Table */}
      {filteredAssets.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
          <HardDrive className="h-12 w-12" />
          <p>{t("owner.noAssets")}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead>{t("owner.assetTitle")}</TableHead>
                <TableHead>{t("owner.assetTenant")}</TableHead>
                <TableHead>{t("owner.filterType")}</TableHead>
                <TableHead>{t("owner.filterProvider")}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>{t("owner.assetSize")}</TableHead>
                <TableHead>{t("owner.usageCount")}</TableHead>
                <TableHead>{t("owner.assetDate")}</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.map((asset) => (
                <TableRow
                  key={asset.id}
                  className={asset.usageCount === 0 ? "bg-amber-50/50" : ""}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(asset.id)}
                      onCheckedChange={() => toggleSelect(asset.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    <div>
                      <span className="truncate block">{asset.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {asset.createdByName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {asset.tenantName}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={TYPE_BADGE[asset.type] ?? ""}
                    >
                      {asset.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {PROVIDER_LABEL[asset.provider] ?? asset.provider}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE[asset.status] ?? ""}
                    >
                      {asset.status === "DELETE_FAILED" && (
                        <AlertTriangle className="mr-1 h-3 w-3" />
                      )}
                      {asset.status === "PROCESSING" && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {asset.status}
                    </Badge>
                    {asset.lastError && asset.status === "DELETE_FAILED" && (
                      <p className="text-xs text-destructive mt-1 truncate max-w-[150px]" title={asset.lastError}>
                        {asset.lastError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatBytes(asset.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    {asset.usageCount > 0 ? (
                      <span className="text-sm">
                        {asset.usageCount} {asset.usageCount === 1 ? "sekcija" : "sekcij"}
                      </span>
                    ) : (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                        {t("owner.orphaned")}
                      </Badge>
                    )}
                    {asset.sections.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {asset.sections.map((s) => (
                          <p key={s.id} className="text-xs text-muted-foreground truncate max-w-[180px]" title={`${s.moduleTitle} → ${s.title}`}>
                            {s.moduleTitle} → {s.title}
                          </p>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={asset.usageCount > 0 ? t("owner.forceDelete") : t("common.delete")}
                      onClick={() => {
                        setForceDeleteTarget(asset);
                        setForceDeleteOpen(true);
                      }}
                    >
                      {asset.usageCount > 0 ? (
                        <Zap className="h-4 w-4 text-destructive" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bulk delete confirmation dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("owner.bulkDeleteOrphaned")}</DialogTitle>
            <DialogDescription>
              {t("owner.bulkDeleteConfirm").replace("{count}", String(selectedOrphaned.length))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={bulkDeleteBusy}
            >
              {bulkDeleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("owner.bulkDeleteOrphaned")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force delete confirmation dialog */}
      <Dialog open={forceDeleteOpen} onOpenChange={setForceDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {forceDeleteTarget && forceDeleteTarget.usageCount > 0
                ? t("owner.forceDelete")
                : t("common.delete")}
            </DialogTitle>
            <DialogDescription>
              {forceDeleteTarget && forceDeleteTarget.usageCount > 0
                ? t("owner.forceDeleteWarning").replace("{count}", String(forceDeleteTarget.usageCount))
                : t("owner.deleteAssetConfirm")}
            </DialogDescription>
          </DialogHeader>
          {forceDeleteTarget && (
            <div className="text-sm space-y-1">
              <p><strong>{forceDeleteTarget.title}</strong></p>
              <p className="text-muted-foreground">
                {forceDeleteTarget.tenantName} · {forceDeleteTarget.type} · {PROVIDER_LABEL[forceDeleteTarget.provider]}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleForceDelete}
              disabled={forceDeleteBusy}
            >
              {forceDeleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {forceDeleteTarget && forceDeleteTarget.usageCount > 0
                ? t("owner.forceDelete")
                : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
