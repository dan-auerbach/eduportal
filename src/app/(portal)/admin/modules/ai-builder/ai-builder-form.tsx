"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Video, FileText, CheckCircle2, XCircle, ExternalLink, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { startAiBuild } from "@/actions/ai-builder";
import { t } from "@/lib/i18n";
import { VideoAssetPicker } from "@/components/admin/video-asset-picker";
import type { VideoAsset, SelectedAsset } from "@/components/admin/video-asset-picker";

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

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "aiBuilder.statusQueued",
  TRANSCRIBING: "aiBuilder.statusTranscribing",
  GENERATING: "aiBuilder.statusGenerating",
  DONE: "aiBuilder.statusDone",
  FAILED: "aiBuilder.statusFailed",
};

const STATUS_BADGE: Record<string, string> = {
  QUEUED: "bg-blue-100 text-blue-800 border-blue-200",
  TRANSCRIBING: "bg-blue-100 text-blue-800 border-blue-200",
  GENERATING: "bg-purple-100 text-purple-800 border-purple-200",
  DONE: "bg-green-100 text-green-800 border-green-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
};

export function AiBuilderForm({ videoAssets, recentBuilds }: AiBuilderFormProps) {
  const [sourceType, setSourceType] = useState<"CF_STREAM_VIDEO" | "TEXT">(
    videoAssets.length > 0 ? "CF_STREAM_VIDEO" : "TEXT",
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAssetStatus, setSelectedAssetStatus] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async () => {
    setError(null);
    setBuildError(null);
    setBuildModuleId(null);
    setBuildStatus(null);
    setIsSubmitting(true);

    try {
      const result = await startAiBuild({
        sourceType,
        mediaAssetId: sourceType === "CF_STREAM_VIDEO" ? (selectedAssetId ?? undefined) : undefined,
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
      // The route handler runs for up to 5 min on Vercel
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
    (sourceType === "CF_STREAM_VIDEO" ? !!videoReady : sourceText.trim().length > 50);

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
