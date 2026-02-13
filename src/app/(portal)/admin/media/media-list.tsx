"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Upload,
  Pencil,
  Eye,
  Trash2,
  Loader2,
  Film,
} from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import {
  createMediaAsset,
  renameMediaAsset,
  deleteMediaAsset,
} from "@/actions/media";

// ── Types ────────────────────────────────────────────────────────────────────

interface MediaAssetRow {
  id: string;
  title: string;
  status: string;
  cfStreamUid: string | null;
  durationSeconds: number | null;
  createdAt: string;
  author: string;
  usageCount: number;
}

interface MediaListProps {
  initialAssets: MediaAssetRow[];
  userRole: string;
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  PROCESSING: "bg-blue-100 text-blue-800 border-blue-200",
  READY: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  PROCESSING: "media.statusProcessing",
  READY: "media.statusReady",
  FAILED: "media.statusFailed",
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MediaList({ initialAssets, userRole }: MediaListProps) {
  const [assets, setAssets] = useState<MediaAssetRow[]>(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwner = userRole === "OWNER";

  // Dialogs
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<MediaAssetRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MediaAssetRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUid, setPreviewUid] = useState<string | null>(null);

  // Poll for processing assets
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollProcessing = useCallback(async () => {
    const processing = assets.filter((a) => a.status === "PROCESSING");
    if (processing.length === 0) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    for (const asset of processing) {
      try {
        const res = await fetch(`/api/media/videos/status?assetId=${asset.id}`);
        if (!res.ok) continue;
        const data = await res.json();

        if (data.status !== "PROCESSING") {
          setAssets((prev) =>
            prev.map((a) =>
              a.id === asset.id ? { ...a, status: data.status } : a,
            ),
          );
        }
      } catch {
        // ignore polling errors
      }
    }
  }, [assets]);

  useEffect(() => {
    const hasProcessing = assets.some((a) => a.status === "PROCESSING");
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(pollProcessing, 4000);
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [assets, pollProcessing]);

  // ── Upload handler ────────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);

    try {
      // 1. Create MediaAsset placeholder
      const result = await createMediaAsset(file.name);
      if (!result.success) {
        toast.error(result.error);
        setUploading(false);
        return;
      }

      const assetId = result.data.assetId;

      // Add to list immediately as PROCESSING
      const newAsset: MediaAssetRow = {
        id: assetId,
        title: file.name,
        status: "PROCESSING",
        cfStreamUid: null,
        durationSeconds: null,
        createdAt: new Date().toISOString(),
        author: "—",
        usageCount: 0,
      };
      setAssets((prev) => [newAsset, ...prev]);

      // 2. TUS upload
      const tus = await import("tus-js-client");

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: `/api/videos/tus-upload?mediaAssetId=${assetId}`,
          chunkSize: 50 * 1024 * 1024,
          retryDelays: [0, 1000, 3000, 5000],
          removeFingerprintOnSuccess: true,
          metadata: {
            filename: file.name,
            filetype: file.type,
          },
          onAfterResponse: (
            _req: unknown,
            res: { getHeader: (name: string) => string | undefined },
          ) => {
            const mediaId = res.getHeader("Stream-Media-Id");
            if (mediaId) {
              setAssets((prev) =>
                prev.map((a) =>
                  a.id === assetId ? { ...a, cfStreamUid: mediaId } : a,
                ),
              );
            }
          },
          onProgress: (bytesUploaded: number, bytesTotal: number) => {
            setUploadProgress(Math.round((bytesUploaded / bytesTotal) * 100));
          },
          onSuccess: () => resolve(),
          onError: (err: Error) => reject(err),
        });
        upload.start();
      });

      toast.success(t("media.uploadVideo") + " ✓");
    } catch (err) {
      console.error("Media upload error:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ── Rename handler ────────────────────────────────────────────────

  const handleRename = async () => {
    if (!renameTarget) return;
    setRenameBusy(true);

    const result = await renameMediaAsset(renameTarget.id, renameValue);
    if (result.success) {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === renameTarget.id ? { ...a, title: renameValue.trim() } : a,
        ),
      );
      setRenameOpen(false);
      toast.success("✓");
    } else {
      toast.error(result.error);
    }

    setRenameBusy(false);
  };

  // ── Delete handler ────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);

    const result = await deleteMediaAsset(deleteTarget.id);
    if (result.success) {
      setAssets((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteOpen(false);
      toast.success("✓");
    } else {
      toast.error(result.error);
    }

    setDeleteBusy(false);
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <>
      {/* Upload bar */}
      <div className="flex items-center gap-3">
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("media.uploadProgress")} {uploadProgress}%
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              {t("media.uploadVideo")}
            </>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        <span className="text-sm text-muted-foreground">
          {t("media.uploadHint")}
        </span>
      </div>

      {/* Table */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center text-muted-foreground">
          <Film className="h-12 w-12" />
          <p>{t("media.noVideos")}</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("media.videoTitle")}</TableHead>
                <TableHead>{t("media.videoStatus")}</TableHead>
                <TableHead>{t("media.videoDuration")}</TableHead>
                <TableHead>{t("media.videoAuthor")}</TableHead>
                <TableHead>{t("media.videoUsage")}</TableHead>
                <TableHead>{t("media.videoDate")}</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium max-w-[250px] truncate">
                    {asset.title}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE[asset.status] ?? ""}
                    >
                      {asset.status === "PROCESSING" && (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {t(STATUS_LABEL[asset.status] ?? "media.statusProcessing")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDuration(asset.durationSeconds)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {asset.author}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {asset.usageCount > 0
                      ? t("media.inUse").replace("{count}", String(asset.usageCount))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {/* Preview */}
                      {asset.cfStreamUid && asset.status === "READY" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("media.preview")}
                          onClick={() => {
                            setPreviewUid(asset.cfStreamUid);
                            setPreviewOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}

                      {/* Rename */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("media.rename")}
                        onClick={() => {
                          setRenameTarget(asset);
                          setRenameValue(asset.title);
                          setRenameOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>

                      {/* Delete (OWNER only) */}
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("media.delete")}
                          onClick={() => {
                            setDeleteTarget(asset);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("media.renameTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>{t("media.renameLabel")}</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              onClick={handleRename}
              disabled={renameBusy || !renameValue.trim()}
            >
              {renameBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("media.renameSave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("media.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("media.deleteConfirm")}
            </DialogDescription>
          </DialogHeader>
          {deleteTarget && deleteTarget.usageCount > 0 && (
            <p className="text-sm text-destructive">
              {t("media.cannotDelete")}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                deleteBusy ||
                (deleteTarget !== null && deleteTarget.usageCount > 0)
              }
            >
              {deleteBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("media.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("media.preview")}</DialogTitle>
          </DialogHeader>
          {previewUid && (
            <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
              <iframe
                src={`https://${process.env.NEXT_PUBLIC_CF_STREAM_SUBDOMAIN}/${previewUid}/iframe`}
                title="Video preview"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
