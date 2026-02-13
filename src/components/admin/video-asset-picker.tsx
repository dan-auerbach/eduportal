"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Video,
  Search,
  Upload,
  Loader2,
  Check,
  Film,
} from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";
import { createMediaAsset } from "@/actions/media";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VideoAsset {
  id: string;
  title: string;
  status: string;
  cfStreamUid: string | null;
  durationSeconds: number | null;
  usageCount: number;
}

export interface SelectedAsset {
  id: string;
  title: string;
  cfStreamUid: string;
  status: string;
}

interface VideoAssetPickerProps {
  selectedAssetId: string | null;
  onSelect: (asset: SelectedAsset) => void;
  initialAssets: VideoAsset[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function VideoAssetPicker({
  selectedAssetId,
  onSelect,
  initialAssets,
}: VideoAssetPickerProps) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<VideoAsset[]>(initialAssets);
  const [search, setSearch] = useState("");

  // Upload state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingAssetId, setUploadingAssetId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Polling for PROCESSING assets
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);
  const selectedLabel = selectedAsset?.title ?? t("media.pickVideo");

  // Sync initial assets when they change (e.g. on server re-render)
  useEffect(() => {
    setAssets(initialAssets);
  }, [initialAssets]);

  // ── Polling ────────────────────────────────────────────────────────

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

          // Auto-select if this was the one we just uploaded
          if (data.status === "READY" && asset.id === uploadingAssetId) {
            onSelect({
              id: asset.id,
              title: asset.title,
              cfStreamUid: asset.cfStreamUid!,
              status: "READY",
            });
            setUploadingAssetId(null);
            setOpen(false);
          }
        }
      } catch {
        // ignore
      }
    }
  }, [assets, uploadingAssetId, onSelect]);

  useEffect(() => {
    const hasProcessing = assets.some((a) => a.status === "PROCESSING");
    if (hasProcessing && !pollingRef.current) {
      pollingRef.current = setInterval(pollProcessing, 4000);
    }
    if (!hasProcessing && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [assets, pollProcessing]);

  // ── Upload ─────────────────────────────────────────────────────────

  const handleFileSelect = async (file: File) => {
    const title = uploadTitle.trim() || file.name;
    setUploading(true);
    setUploadProgress(0);

    try {
      // Create MediaAsset
      const result = await createMediaAsset(title);
      if (!result.success) {
        toast.error(result.error);
        setUploading(false);
        return;
      }

      const assetId = result.data.assetId;
      setUploadingAssetId(assetId);

      // Add to assets list immediately
      const newAsset: VideoAsset = {
        id: assetId,
        title,
        status: "PROCESSING",
        cfStreamUid: null,
        durationSeconds: null,
        usageCount: 0,
      };
      setAssets((prev) => [newAsset, ...prev]);

      // TUS upload
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

      // Upload done → CF is processing → polling will auto-select when READY
      setUploadTitle("");
      toast.success(t("media.uploadVideo") + " ✓");
    } catch (err) {
      console.error("Video upload error:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────

  const filtered = search.trim()
    ? assets.filter((a) =>
        a.title.toLowerCase().includes(search.toLowerCase()),
      )
    : assets;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="outline"
        className="w-full justify-start text-left font-normal"
        onClick={() => setOpen(true)}
      >
        <Video className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">{selectedLabel}</span>
        {selectedAsset?.status === "READY" && (
          <Check className="ml-auto h-4 w-4 text-green-600 shrink-0" />
        )}
        {selectedAsset?.status === "PROCESSING" && (
          <Loader2 className="ml-auto h-4 w-4 animate-spin text-blue-600 shrink-0" />
        )}
      </Button>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>{t("media.pickerTitle")}</DialogTitle>
          </DialogHeader>

          {/* Upload section — first */}
          <div className="space-y-3">
            <p className="text-sm font-medium">
              {t("media.uploadNew")}
            </p>

            <div className="space-y-2">
              <Label className="text-xs">{t("media.titleLabel")}</Label>
              <Input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder={t("media.titlePlaceholder")}
                disabled={uploading}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
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
                    {t("media.chooseFile")}
                  </>
                )}
              </Button>
            </div>

            {uploading && (
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
                e.target.value = "";
              }}
            />
          </div>

          {/* Existing assets — below upload */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              {t("media.orPickExisting")}
            </p>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("media.searchPlaceholder")}
                className="pl-9"
              />
            </div>

            {/* Asset list — show max 3 unless searching */}
            <ScrollArea className="max-h-[220px]">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                  <Film className="h-6 w-6" />
                  <p className="text-sm">{t("media.noVideos")}</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {(search.trim() ? filtered : filtered.slice(0, 3)).map((asset) => {
                    const isReady = asset.status === "READY";
                    const isSelected = asset.id === selectedAssetId;

                    return (
                      <button
                        key={asset.id}
                        type="button"
                        disabled={!isReady}
                        onClick={() => {
                          if (isReady && asset.cfStreamUid) {
                            onSelect({
                              id: asset.id,
                              title: asset.title,
                              cfStreamUid: asset.cfStreamUid,
                              status: asset.status,
                            });
                            setOpen(false);
                          }
                        }}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors
                          ${isSelected ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"}
                          ${!isReady ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">
                            {asset.title}
                          </span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            variant="outline"
                            className={`text-xs ${STATUS_BADGE[asset.status] ?? ""}`}
                          >
                            {asset.status === "PROCESSING" && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            {t(STATUS_LABEL[asset.status] ?? "media.statusProcessing")}
                          </Badge>
                          {asset.usageCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {t("media.inUse").replace(
                                "{count}",
                                String(asset.usageCount),
                              )}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  {!search.trim() && filtered.length > 3 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {t("media.searchForMore")}
                    </p>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
