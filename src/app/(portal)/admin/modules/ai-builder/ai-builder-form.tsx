"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  Video,
  FileText,
  FileUp,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  X,
} from "lucide-react";
import Link from "next/link";
import { startAiBuild } from "@/actions/ai-builder";
import { t } from "@/lib/i18n";
import { VideoAssetPicker } from "@/components/admin/video-asset-picker";
import type { VideoAsset, SelectedAsset } from "@/components/admin/video-asset-picker";
import { toast } from "sonner";

interface RecentBuild {
  id: string;
  sourceType: string;
  status: string;
  error: string | null;
  createdModuleId: string | null;
  createdAt: string;
  moduleTitle: string | null;
}

interface AiBuilderFormProps {
  videoAssets: VideoAsset[];
  recentBuilds: RecentBuild[];
}

type SourceType = "CF_STREAM_VIDEO" | "TEXT" | "FILE";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED_EXTENSIONS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "aiBuilder.statusQueued",
  TRANSCRIBING: "aiBuilder.statusTranscribing",
  EXTRACTING: "aiBuilder.statusExtracting",
  GENERATING: "aiBuilder.statusGenerating",
  DONE: "aiBuilder.statusDone",
  FAILED: "aiBuilder.statusFailed",
};

const STATUS_BADGE: Record<string, string> = {
  QUEUED: "bg-blue-100 text-blue-800 border-blue-200",
  TRANSCRIBING: "bg-blue-100 text-blue-800 border-blue-200",
  EXTRACTING: "bg-blue-100 text-blue-800 border-blue-200",
  GENERATING: "bg-purple-100 text-purple-800 border-purple-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AiBuilderForm({ videoAssets, recentBuilds }: AiBuilderFormProps) {
  const [sourceType, setSourceType] = useState<SourceType>(
    videoAssets.length > 0 ? "CF_STREAM_VIDEO" : "TEXT",
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetStatus, setSelectedAssetStatus] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // File upload state
  const [fileAssetId, setFileAssetId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Active build polling
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [buildStatus, setBuildStatus] = useState<string | null>(null);
  const [buildModuleId, setBuildModuleId] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for build status
  const pollStatus = useCallback(async (buildId: string) => {
    try {
      const res = await fetch(`/api/ai-builder/status?buildId=${buildId}`);
      if (!res.ok) return;

      const data = await res.json();
      setBuildStatus(data.status);

      if (data.status === "DONE") {
        setBuildModuleId(data.createdModuleId);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }

      if (data.status === "FAILED") {
        setBuildError(data.error);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch {
      // ignore polling errors
    }
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const handleAssetSelect = useCallback((asset: SelectedAsset) => {
    setSelectedAssetId(asset.id);
    setSelectedAssetStatus(asset.status);
  }, []);

  // ── File upload handler ─────────────────────────────────────────────

  const handleFileUpload = useCallback(async (file: File) => {
    // Client-side validation
    if (!ALLOWED_EXTENSIONS.has(file.type)) {
      toast.error(t("aiBuilder.unsupportedFormat"));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t("aiBuilder.fileTooLarge"));
      return;
    }

    setFileUploading(true);
    setFileUploadProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name);

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<{ success: boolean; assetId?: string; title?: string; error?: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/media/document-upload");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setFileUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              resolve({ success: false, error: data.error || "Upload failed" });
            }
          } catch {
            resolve({ success: false, error: "Upload failed" });
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      if (result.success && result.assetId) {
        setFileAssetId(result.assetId);
        setFileName(file.name);
        setFileSize(file.size);
        toast.success(t("aiBuilder.fileUploaded"));
      } else {
        toast.error(result.error ?? t("aiBuilder.fileUploadError"));
      }
    } catch (err) {
      console.error("File upload error:", err);
      toast.error(t("aiBuilder.fileUploadError"));
    } finally {
      setFileUploading(false);
      setFileUploadProgress(0);
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    setFileAssetId(null);
    setFileName(null);
    setFileSize(null);
  }, []);

  // ── Drag & drop handlers ────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFileUpload(file);
      }
    },
    [handleFileUpload],
  );

  // ── Submit ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);
    setBuildError(null);
    setBuildModuleId(null);
    setBuildStatus(null);
    setIsSubmitting(true);

    try {
      const mediaAssetId =
        sourceType === "CF_STREAM_VIDEO"
          ? (selectedAssetId ?? undefined)
          : sourceType === "FILE"
            ? (fileAssetId ?? undefined)
            : undefined;

      const result = await startAiBuild({
        sourceType,
        mediaAssetId,
        sourceText: sourceType === "TEXT" ? sourceText : undefined,
        notes: notes.trim() || undefined,
      });

      if (!result.success) {
        if (result.error === "RATE_LIMIT") {
          setError(t("aiBuilder.rateLimitError"));
        } else {
          setError(result.error);
        }
        setIsSubmitting(false);
        return;
      }

      // Trigger the pipeline from the browser (fire-and-forget POST)
      const buildId = result.data.buildId;
      setActiveBuildId(buildId);
      setBuildStatus("QUEUED");
      setIsSubmitting(false);

      fetch(`/api/ai-builder/run?buildId=${buildId}`, { method: "POST" }).catch(
        () => {}, // ignore — we poll status separately
      );

      // Poll status every 3s
      pollStatus(buildId);
      pollingRef.current = setInterval(() => pollStatus(buildId), 3000);
    } catch {
      setError(t("aiBuilder.unexpectedError"));
      setIsSubmitting(false);
    }
  };

  const isProcessing =
    buildStatus !== null &&
    buildStatus !== "DONE" &&
    buildStatus !== "FAILED";

  const videoReady = selectedAssetId && selectedAssetStatus === "READY";
  const canSubmit =
    !isSubmitting &&
    !isProcessing &&
    (sourceType === "CF_STREAM_VIDEO"
      ? !!videoReady
      : sourceType === "TEXT"
        ? sourceText.trim().length > 50
        : !!fileAssetId);

  return (
    <div className="space-y-6">
      {/* Source picker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("aiBuilder.sourceTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source type toggle */}
          <div className="flex gap-2">
            <Button
              variant={sourceType === "CF_STREAM_VIDEO" ? "default" : "outline"}
              size="sm"
              onClick={() => setSourceType("CF_STREAM_VIDEO")}
            >
              <Video className="mr-2 h-4 w-4" />
              {t("aiBuilder.sourceVideo")}
            </Button>
            <Button
              variant={sourceType === "TEXT" ? "default" : "outline"}
              size="sm"
              onClick={() => setSourceType("TEXT")}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t("aiBuilder.sourceText")}
            </Button>
            <Button
              variant={sourceType === "FILE" ? "default" : "outline"}
              size="sm"
              onClick={() => setSourceType("FILE")}
            >
              <FileUp className="mr-2 h-4 w-4" />
              {t("aiBuilder.sourceFile")}
            </Button>
          </div>

          {/* Video picker */}
          {sourceType === "CF_STREAM_VIDEO" && (
            <div className="space-y-2">
              <Label>{t("aiBuilder.selectVideo")}</Label>
              <VideoAssetPicker
                selectedAssetId={selectedAssetId}
                onSelect={handleAssetSelect}
                initialAssets={videoAssets}
              />
              {selectedAssetId && selectedAssetStatus === "PROCESSING" && (
                <p className="text-sm text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("media.notReady")}
                </p>
              )}
            </div>
          )}

          {/* Text input */}
          {sourceType === "TEXT" && (
            <div className="space-y-2">
              <Label>{t("aiBuilder.pasteText")}</Label>
              <Textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder={t("aiBuilder.pasteTextPlaceholder")}
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {sourceText.length > 0 && `${sourceText.length} ${t("aiBuilder.chars")}`}
              </p>
            </div>
          )}

          {/* File upload */}
          {sourceType === "FILE" && (
            <div className="space-y-3">
              <Label>{t("aiBuilder.uploadFile")}</Label>

              {fileAssetId && fileName ? (
                /* Uploaded file display */
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{fileName}</p>
                    {fileSize && (
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(fileSize)}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveFile}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">{t("aiBuilder.removeFile")}</span>
                  </Button>
                </div>
              ) : (
                /* Drop zone / upload area */
                <div
                  ref={dropZoneRef}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !fileUploading && fileInputRef.current?.click()}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center cursor-pointer transition-colors
                    ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
                    ${fileUploading ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  {fileUploading ? (
                    <>
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm font-medium">
                        {fileUploadProgress}%
                      </p>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {t("aiBuilder.uploadFileDrag")}
                      </p>
                      <p className="text-xs text-muted-foreground/70">
                        {t("aiBuilder.supportedFormats")}
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Upload progress bar */}
              {fileUploading && (
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${fileUploadProgress}%` }}
                  />
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          {/* Notes / context (optional, for VIDEO source) */}
          {sourceType === "CF_STREAM_VIDEO" && selectedAssetId && (
            <div className="space-y-2">
              <Label>{t("aiBuilder.notes")}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("aiBuilder.notesPlaceholder")}
                rows={3}
              />
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              size="lg"
            >
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {t("aiBuilder.generate")}
            </Button>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Active build status */}
      {buildStatus && (
        <Card>
          <CardContent className="py-6">
            <div className="flex flex-col items-center gap-4 text-center">
              {isProcessing && (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div>
                    <p className="font-semibold">
                      {t(STATUS_LABELS[buildStatus] ?? "aiBuilder.statusQueued")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("aiBuilder.processingHint")}
                    </p>
                  </div>
                </>
              )}

              {buildStatus === "DONE" && buildModuleId && (
                <>
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-semibold text-green-700">
                      {t("aiBuilder.statusDone")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("aiBuilder.doneHint")}
                    </p>
                  </div>
                  <Button asChild>
                    <Link href={`/admin/modules/${buildModuleId}/edit`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {t("aiBuilder.editDraft")}
                    </Link>
                  </Button>
                </>
              )}

              {buildStatus === "FAILED" && (
                <>
                  <XCircle className="h-8 w-8 text-destructive" />
                  <div>
                    <p className="font-semibold text-destructive">
                      {t("aiBuilder.statusFailed")}
                    </p>
                    {buildError && (
                      <p className="text-sm text-muted-foreground mt-1 max-w-md">
                        {buildError}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent builds */}
      {recentBuilds.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("aiBuilder.recentBuilds")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentBuilds.map((build) => (
                <div
                  key={build.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE[build.status] ?? ""}
                    >
                      {t(STATUS_LABELS[build.status] ?? "aiBuilder.statusQueued")}
                    </Badge>
                    <span className="text-muted-foreground truncate">
                      {build.moduleTitle ??
                        (build.sourceType === "CF_STREAM_VIDEO"
                          ? t("aiBuilder.sourceVideo")
                          : build.sourceType === "FILE"
                            ? t("aiBuilder.sourceFile")
                            : t("aiBuilder.sourceText"))}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(build.createdAt).toLocaleDateString()}
                    </span>
                    {build.status === "DONE" && build.createdModuleId && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/modules/${build.createdModuleId}/edit`}>
                          {t("aiBuilder.editDraft")}
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
