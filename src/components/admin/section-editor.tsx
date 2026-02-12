"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  updateSection,
  deleteSection,
  duplicateSection,
  saveVideoMetadata,
} from "@/actions/modules";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Save,
  MoreHorizontal,
  Copy,
  Trash2,
  Check,
  Loader2,
  AlertTriangle,
  ChevronDown,
  Upload,
  X,
  FileText,
} from "lucide-react";
import { RichTextEditor } from "./rich-text-editor";
import type { SectionType, VideoSourceType } from "@/generated/prisma/client";
import { t } from "@/lib/i18n";

function getSectionTypeLabel(sectionType: SectionType): string {
  return t(`sectionType.${sectionType}`);
}

interface SectionData {
  id: string;
  title: string;
  content: string;
  type: SectionType;
  sortOrder: number;
  unlockAfterSectionId: string | null;
  videoSourceType: "YOUTUBE_VIMEO_URL" | "UPLOAD" | "CLOUDFLARE_STREAM" | "TARGETVIDEO";
  videoBlobUrl: string | null;
  videoFileName: string | null;
  videoSize: number | null;
  videoMimeType: string | null;
  cloudflareStreamUid: string | null;
  videoStatus: "PENDING" | "READY" | "ERROR" | null;
}

interface SectionEditorSheetProps {
  section: SectionData | null;
  allSections: { id: string; title: string }[];
  moduleId: string;
  onClose: () => void;
}

type SaveStatus = "saved" | "saving" | "unsaved";

export function SectionEditorSheet({
  section,
  allSections,
  moduleId,
  onClose,
}: SectionEditorSheetProps) {
  const router = useRouter();
  const [localTitle, setLocalTitle] = useState("");
  const [localContent, setLocalContent] = useState("");
  const [localType, setLocalType] = useState<SectionType>("TEXT");
  const [localUnlockAfter, setLocalUnlockAfter] = useState("none");
  const [localVideoSourceType, setLocalVideoSourceType] = useState<VideoSourceType>("TARGETVIDEO");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const savedValuesRef = useRef({
    title: "",
    content: "",
    type: "TEXT" as SectionType,
    unlockAfter: "none",
    videoSourceType: "TARGETVIDEO" as VideoSourceType,
  });
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionIdRef = useRef<string | null>(null);

  // Sync local state when section prop changes
  useEffect(() => {
    if (section) {
      setLocalTitle(section.title);
      setLocalContent(section.content);
      setLocalType(section.type);
      setLocalUnlockAfter(section.unlockAfterSectionId || "none");
      setLocalVideoSourceType(section.videoSourceType || "TARGETVIDEO");
      setSaveStatus("saved");
      savedValuesRef.current = {
        title: section.title,
        content: section.content,
        type: section.type,
        unlockAfter: section.unlockAfterSectionId || "none",
        videoSourceType: section.videoSourceType || "TARGETVIDEO",
      };
      sectionIdRef.current = section.id;
    }
  }, [section]);

  const isDirty = useCallback(() => {
    return (
      localTitle !== savedValuesRef.current.title ||
      localContent !== savedValuesRef.current.content ||
      localType !== savedValuesRef.current.type ||
      localUnlockAfter !== savedValuesRef.current.unlockAfter ||
      localVideoSourceType !== savedValuesRef.current.videoSourceType
    );
  }, [localTitle, localContent, localType, localUnlockAfter, localVideoSourceType]);

  const handleSave = useCallback(async (manual = false) => {
    if (!sectionIdRef.current) return;
    if (!isDirty()) {
      // If manual save clicked but nothing dirty, still show feedback
      if (manual) {
        toast.success(t("admin.sectionEditor.sectionSaved"));
      }
      return;
    }

    setSaveStatus("saving");

    const data = {
      title: localTitle,
      content: localContent,
      type: localType,
      unlockAfterSectionId:
        localUnlockAfter === "none" ? null : localUnlockAfter,
      videoSourceType: localVideoSourceType,
    };

    const result = await updateSection(sectionIdRef.current, data);

    if (result.success) {
      setSaveStatus("saved");
      savedValuesRef.current = {
        title: localTitle,
        content: localContent,
        type: localType,
        unlockAfter: localUnlockAfter,
        videoSourceType: localVideoSourceType,
      };
      if (manual) {
        toast.success(t("admin.sectionEditor.sectionSaved"));
      }
      router.refresh();
    } else {
      setSaveStatus("unsaved");
      toast.error(result.error);
    }
  }, [localTitle, localContent, localType, localUnlockAfter, localVideoSourceType, isDirty, router]);

  // Autosave debounce
  useEffect(() => {
    if (!section) return;
    if (!isDirty()) return;

    setSaveStatus("unsaved");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      handleSave();
    }, 2000);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [localTitle, localContent, localType, localUnlockAfter, localVideoSourceType, section, isDirty, handleSave]);

  function handleClose() {
    if (isDirty() && saveStatus === "unsaved") {
      const confirmed = window.confirm(
        t("admin.sectionEditor.unsavedWarning")
      );
      if (!confirmed) return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    onClose();
  }

  async function handleDelete() {
    if (!section) return;
    setDeleting(true);

    const result = await deleteSection(section.id);

    if (result.success) {
      toast.success(t("admin.sectionEditor.sectionDeleted"));
      setShowDeleteDialog(false);
      onClose();
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setDeleting(false);
  }

  async function handleDuplicate() {
    if (!section) return;

    const result = await duplicateSection(section.id);

    if (result.success) {
      toast.success(t("admin.sectionEditor.sectionDuplicated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const otherSections = allSections.filter((s) => s.id !== section?.id);

  return (
    <>
      <Sheet
        open={!!section}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl flex flex-col p-0"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>
              {section?.title || t("admin.sectionEditor.untitledSection")}
            </SheetTitle>
            <SheetDescription>
              {t("admin.sectionEditor.content")}
            </SheetDescription>
          </SheetHeader>

          {/* Custom Header */}
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              placeholder={t("admin.sectionEditor.untitledSection")}
              className="flex-1 bg-transparent text-lg font-semibold outline-none border-none focus:ring-0 placeholder:text-muted-foreground"
            />
            <Badge variant="outline" className="text-xs shrink-0">
              {getSectionTypeLabel(localType)}
            </Badge>
            <SaveStatusIndicator status={saveStatus} />
            <Button size="sm" onClick={() => handleSave(true)} disabled={saveStatus === "saving"}>
              <Save className="mr-1 h-4 w-4" />
              {t("admin.sectionEditor.saveSection")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  {t("admin.sectionEditor.duplicate")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Body */}
          <ScrollArea className="flex-1 px-4 py-4">
            <div className="space-y-6">
              {/* Type selector */}
              <div className="space-y-2">
                <Label>{t("admin.sectionEditor.type")}</Label>
                <Select
                  value={localType}
                  onValueChange={(v) => setLocalType(v as SectionType)}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXT">
                      {t("sectionType.TEXT")}
                    </SelectItem>
                    <SelectItem value="VIDEO">
                      {t("sectionType.VIDEO")}
                    </SelectItem>
                    <SelectItem value="ATTACHMENT">
                      {t("sectionType.ATTACHMENT")}
                    </SelectItem>
                    <SelectItem value="MIXED">
                      {t("sectionType.MIXED")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Type-specific content editor */}
              <TypeSpecificEditor
                type={localType}
                content={localContent}
                onChange={setLocalContent}
                videoSourceType={localVideoSourceType}
                onVideoSourceTypeChange={setLocalVideoSourceType}
                sectionId={section?.id ?? null}
                videoBlobUrl={section?.videoBlobUrl ?? null}
                videoFileName={section?.videoFileName ?? null}
                videoSize={section?.videoSize ?? null}
                cloudflareStreamUid={section?.cloudflareStreamUid ?? null}
                videoStatus={section?.videoStatus ?? null}
                onVideoUploaded={() => {
                  setSaveStatus("saved");
                  router.refresh();
                }}
              />

              {/* Advanced section */}
              <Separator />
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-between px-0"
                  >
                    {t("admin.sectionEditor.advanced")}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>{t("admin.sectionEditor.unlockAfter")}</Label>
                    <Select
                      value={localUnlockAfter}
                      onValueChange={setLocalUnlockAfter}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            "admin.sectionEditor.noDependency"
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {t("admin.sectionEditor.noDependency")}
                        </SelectItem>
                        {otherSections.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("admin.sectionEditor.confirmDeleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("admin.sectionEditor.confirmDeleteDescription")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Save Status Indicator ────────────────────────────────────────────

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  switch (status) {
    case "saved":
      return (
        <span className="flex items-center gap-1 text-xs text-green-600">
          <Check className="h-3.5 w-3.5" />
          {t("admin.sectionEditor.saved")}
        </span>
      );
    case "saving":
      return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("admin.sectionEditor.saving")}
        </span>
      );
    case "unsaved":
      return (
        <span className="flex items-center gap-1 text-xs text-yellow-600">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("admin.sectionEditor.unsaved")}
        </span>
      );
  }
}

// ─── Type-Specific Editor ─────────────────────────────────────────────

function TypeSpecificEditor({
  type,
  content,
  onChange,
  videoSourceType,
  onVideoSourceTypeChange,
  sectionId,
  videoBlobUrl,
  videoFileName,
  videoSize,
  cloudflareStreamUid,
  videoStatus,
  onVideoUploaded,
}: {
  type: SectionType;
  content: string;
  onChange: (value: string) => void;
  videoSourceType: VideoSourceType;
  onVideoSourceTypeChange: (v: VideoSourceType) => void;
  sectionId: string | null;
  videoBlobUrl: string | null;
  videoFileName: string | null;
  videoSize: number | null;
  cloudflareStreamUid: string | null;
  videoStatus: "PENDING" | "READY" | "ERROR" | null;
  onVideoUploaded?: () => void;
}) {
  switch (type) {
    case "TEXT":
      return <TextEditor content={content} onChange={onChange} />;
    case "VIDEO":
      return (
        <VideoEditor
          content={content}
          onChange={onChange}
          videoSourceType={videoSourceType}
          onVideoSourceTypeChange={onVideoSourceTypeChange}
          sectionId={sectionId}
          videoBlobUrl={videoBlobUrl}
          videoFileName={videoFileName}
          videoSize={videoSize}
          cloudflareStreamUid={cloudflareStreamUid}
          videoStatus={videoStatus}
          onVideoUploaded={onVideoUploaded}
        />
      );
    case "ATTACHMENT":
      return <AttachmentEditor content={content} onChange={onChange} />;
    case "MIXED":
      return (
        <MixedEditor
          content={content}
          onChange={onChange}
          videoSourceType={videoSourceType}
          onVideoSourceTypeChange={onVideoSourceTypeChange}
          sectionId={sectionId}
          videoBlobUrl={videoBlobUrl}
          videoFileName={videoFileName}
          videoSize={videoSize}
          cloudflareStreamUid={cloudflareStreamUid}
          videoStatus={videoStatus}
          onVideoUploaded={onVideoUploaded}
        />
      );
    default:
      return <TextEditor content={content} onChange={onChange} />;
  }
}

// ─── TEXT Editor (TipTap) ─────────────────────────────────────────────

function TextEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{t("admin.sectionEditor.content")}</Label>
      <RichTextEditor
        content={content}
        onChange={onChange}
        placeholder={t("admin.sectionEditor.richTextPlaceholder")}
      />
    </div>
  );
}

// ─── VIDEO Editor ─────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /youtube\.com\/v\/([^&\s?]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function VideoEditor({
  content,
  onChange,
  videoSourceType,
  onVideoSourceTypeChange,
  sectionId,
  videoBlobUrl,
  videoFileName,
  videoSize,
  cloudflareStreamUid,
  videoStatus,
  onVideoUploaded,
}: {
  content: string;
  onChange: (value: string) => void;
  videoSourceType: VideoSourceType;
  onVideoSourceTypeChange: (v: VideoSourceType) => void;
  sectionId: string | null;
  onVideoUploaded?: () => void;
  videoBlobUrl: string | null;
  videoFileName: string | null;
  videoSize: number | null;
  cloudflareStreamUid: string | null;
  videoStatus: "PENDING" | "READY" | "ERROR" | null;
}) {
  const videoId = useMemo(() => extractYouTubeId(content), [content]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Local state to show newly uploaded video immediately
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [localFileName, setLocalFileName] = useState<string | null>(null);
  const [localFileSize, setLocalFileSize] = useState<number | null>(null);
  // CF Stream local state
  const [localCfUid, setLocalCfUid] = useState<string | null>(null);
  const [localVideoStatus, setLocalVideoStatus] = useState<"PENDING" | "READY" | "ERROR" | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync local state with props
  useEffect(() => {
    setLocalBlobUrl(videoBlobUrl);
    setLocalFileName(videoFileName);
    setLocalFileSize(videoSize);
    setLocalCfUid(cloudflareStreamUid);
    setLocalVideoStatus(videoStatus);
  }, [videoBlobUrl, videoFileName, videoSize, cloudflareStreamUid, videoStatus]);

  // Clean up status polling on unmount
  useEffect(() => {
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, []);

  // Start polling for CF Stream video status
  const startStatusPolling = useCallback((sid: string) => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);
    statusPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/videos/status?sectionId=${sid}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "READY") {
          setLocalVideoStatus("READY");
          if (statusPollRef.current) clearInterval(statusPollRef.current);
          onVideoUploaded?.();
        } else if (data.status === "ERROR") {
          setLocalVideoStatus("ERROR");
          if (statusPollRef.current) clearInterval(statusPollRef.current);
          toast.error(t("admin.sectionEditor.videoError"));
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);
  }, [onVideoUploaded]);

  const handleCloudflareUpload = useCallback(async (file: File) => {
    if (!sectionId) {
      toast.error(t("admin.sectionEditor.videoSaveFirst"));
      return;
    }

    const allowedTypes = ["video/mp4", "video/webm", "video/ogg", "video/quicktime"];
    if (!allowedTypes.includes(file.type)) {
      toast.error(t("admin.sectionEditor.videoInvalidFormat"));
      return;
    }

    if (file.size > 600 * 1024 * 1024) {
      toast.error(t("admin.sectionEditor.videoTooLarge"));
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      // Upload via TUS protocol through our proxy endpoint.
      // Our proxy creates the upload on Cloudflare and returns the CF upload URL
      // in the Location header. tus-js-client then sends PATCH requests directly
      // to Cloudflare — no HEAD request needed (which avoids CORS issues).
      const tus = await import("tus-js-client");

      let streamUid = "";

      await new Promise<void>((resolve, reject) => {
        const upload = new tus.Upload(file, {
          endpoint: `/api/videos/tus-upload?sectionId=${sectionId}`,
          chunkSize: 50 * 1024 * 1024, // 50 MB chunks
          retryDelays: [0, 1000, 3000, 5000],
          removeFingerprintOnSuccess: true,
          metadata: {
            filename: file.name,
            filetype: file.type,
          },
          onAfterResponse: (_req: unknown, res: { getHeader: (name: string) => string | undefined }) => {
            // Capture the stream-media-id from our proxy's 201 response
            const mediaId = res.getHeader("Stream-Media-Id");
            if (mediaId) {
              streamUid = mediaId;
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

      if (!streamUid) {
        toast.error(t("admin.sectionEditor.videoUploadError"));
        return;
      }

      // Save metadata via server action (DB already has UID from proxy,
      // this updates file info and handles old video cleanup)
      const result = await saveVideoMetadata(sectionId, {
        cloudflareStreamUid: streamUid,
        videoFileName: file.name,
        videoSize: file.size,
        videoMimeType: file.type,
      });

      if (result.success) {
        setLocalCfUid(streamUid);
        setLocalFileName(file.name);
        setLocalFileSize(file.size);
        setLocalVideoStatus("PENDING");
        toast.success(t("admin.sectionEditor.videoUploaded"));
        // Start polling for readyToStream
        startStatusPolling(sectionId);
      } else {
        toast.error(result.error || t("admin.sectionEditor.videoUploadError"));
      }
    } catch (err) {
      console.error("Video upload error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || t("admin.sectionEditor.videoUploadError"));
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }, [sectionId, startStatusPolling]);

  const cfStreamSubdomain = process.env.NEXT_PUBLIC_CF_STREAM_SUBDOMAIN;

  return (
    <div className="space-y-4">
      {/* Video source selector */}
      <div className="space-y-2">
        <Label>{t("admin.sectionEditor.videoSource")}</Label>
        <Select
          value={videoSourceType}
          onValueChange={(v) => {
            const newSource = v as VideoSourceType;
            // Clear content when switching source to avoid stale HTML/URL/ID leaking
            if (newSource !== videoSourceType) {
              onChange("");
            }
            onVideoSourceTypeChange(newSource);
          }}
        >
          <SelectTrigger className="w-[280px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="YOUTUBE_VIMEO_URL">
              {t("admin.sectionEditor.videoSourceUrl")}
            </SelectItem>
            <SelectItem value="CLOUDFLARE_STREAM">
              {t("admin.sectionEditor.videoSourceCloudflare")}
            </SelectItem>
            <SelectItem value="TARGETVIDEO">
              {t("admin.sectionEditor.videoSourceTargetVideo")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* YouTube/Vimeo URL mode */}
      {videoSourceType === "YOUTUBE_VIMEO_URL" && (
        <>
          <div className="space-y-2">
            <Label>{t("admin.sectionEditor.videoUrlLabel")}</Label>
            <Input
              value={content}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t("admin.sectionEditor.videoUrlPlaceholder")}
            />
          </div>
          {videoId ? (
            <div className="space-y-2">
              <Label className="text-muted-foreground">
                {t("admin.sectionEditor.videoPreview")}
              </Label>
              <div className="aspect-video w-full overflow-hidden rounded-md border bg-muted">
                <iframe
                  src={`https://www.youtube.com/embed/${videoId}`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : content ? (
            <p className="text-sm text-destructive">
              {t("admin.sectionEditor.invalidVideoUrl")}
            </p>
          ) : null}
        </>
      )}

      {/* Cloudflare Stream upload mode */}
      {videoSourceType === "CLOUDFLARE_STREAM" && (
        <>
          {localCfUid ? (
            <div className="space-y-3">
              {/* Video preview or processing state */}
              {localVideoStatus === "READY" && cfStreamSubdomain ? (
                <div className="space-y-2">
                  <Label className="text-muted-foreground">
                    {t("admin.sectionEditor.videoPreview")}
                  </Label>
                  <div className="aspect-video w-full overflow-hidden rounded-md border bg-black">
                    <iframe
                      src={`https://${cfStreamSubdomain}/${localCfUid}/iframe`}
                      className="h-full w-full border-0"
                      allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : localVideoStatus === "ERROR" ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 px-6 py-8">
                  <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                  <p className="text-sm font-medium text-destructive">
                    {t("admin.sectionEditor.videoError")}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center rounded-md border px-6 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {t("admin.sectionEditor.videoProcessing")}
                  </p>
                </div>
              )}

              {/* File info + actions */}
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">
                  {localFileName || t("admin.sectionEditor.videoFile")}
                </span>
                {localFileSize && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(localFileSize)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {t("admin.sectionEditor.videoReplace")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              className="flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 transition-colors cursor-pointer border-muted-foreground/25 hover:border-muted-foreground/50"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {t("admin.sectionEditor.videoUploading")} {uploadProgress}%
                  </p>
                  <div className="w-full max-w-xs mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    {t("admin.sectionEditor.videoDropHint")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    MP4, WebM, OGG, MOV (max 600 MB)
                  </p>
                </>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.mov"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCloudflareUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
        </>
      )}

      {/* Legacy Upload mode (for existing blob videos) */}
      {videoSourceType === "UPLOAD" && (
        <>
          {localBlobUrl ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">
                  {t("admin.sectionEditor.videoPreview")}
                </Label>
                <div className="aspect-video w-full overflow-hidden rounded-md border bg-black">
                  <video
                    src={localBlobUrl}
                    controls
                    className="h-full w-full"
                    preload="metadata"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm truncate">
                  {localFileName || t("admin.sectionEditor.videoFile")}
                </span>
                {localFileSize && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(localFileSize)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("admin.sectionEditor.videoLegacyHint")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("admin.sectionEditor.videoLegacyHint")}
            </p>
          )}
        </>
      )}

      {/* TargetVideo mode */}
      {videoSourceType === "TARGETVIDEO" && (
        <TargetVideoInput content={content} onChange={onChange} />
      )}
    </div>
  );
}

// ─── TargetVideo ID Input ─────────────────────────────────────────────

/** Validates a TargetVideo ID: digits only, at least 4 chars */
function isValidTargetVideoId(id: string): boolean {
  return /^\d{4,}$/.test(id.trim());
}

function TargetVideoInput({
  content,
  onChange,
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  // Strip any non-digit chars (handles stale HTML like "<p></p>" from type switch)
  const digitsOnly = content.replace(/[^\d]/g, "");

  // Auto-clean content if it had non-digit chars (e.g. leftover HTML)
  useEffect(() => {
    if (content !== digitsOnly) {
      onChange(digitsOnly);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on mount

  const showError = digitsOnly.length > 0 && !isValidTargetVideoId(digitsOnly);

  return (
    <div className="space-y-2">
      <Label>{t("admin.sectionEditor.targetVideoIdLabel")}</Label>
      <Input
        value={digitsOnly}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d]/g, "");
          onChange(cleaned);
        }}
        placeholder={t("admin.sectionEditor.targetVideoIdPlaceholder")}
        inputMode="numeric"
        pattern="[0-9]*"
      />
      {showError && (
        <p className="text-sm text-destructive">
          {t("admin.sectionEditor.targetVideoIdInvalid")}
        </p>
      )}
      {isValidTargetVideoId(digitsOnly) && (
        <p className="text-sm text-muted-foreground">
          Video ID: {digitsOnly}
        </p>
      )}
    </div>
  );
}

// ─── ATTACHMENT Editor ────────────────────────────────────────────────

interface FileEntry {
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
}

function parseFiles(content: string): FileEntry[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const files = useMemo(() => parseFiles(content), [content]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: async (acceptedFiles) => {
      setUploading(true);
      const currentFiles = [...files];

      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            currentFiles.push({
              fileName: data.fileName,
              storagePath: data.storagePath,
              mimeType: data.mimeType,
              fileSize: data.fileSize,
            });
            toast.success(t("admin.sectionEditor.fileUploaded"));
          } else {
            const errData = await res.json().catch(() => null);
            toast.error(errData?.error || t("common.uploadFailed"));
          }
        } catch {
          toast.error(t("common.uploadFailed"));
        }
      }

      onChange(JSON.stringify(currentFiles));
      setUploading(false);
    },
  });

  function removeFile(index: number) {
    const newFiles = files.filter((_, i) => i !== index);
    onChange(newFiles.length > 0 ? JSON.stringify(newFiles) : "");
    toast.success(t("admin.sectionEditor.fileRemoved"));
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 transition-colors cursor-pointer ${
          isDragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="h-8 w-8 text-muted-foreground mb-2" />
        <p className="text-sm font-medium">
          {uploading
            ? t("admin.sectionEditor.uploadingFile")
            : t("admin.sectionEditor.dropzoneText")}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("admin.sectionEditor.dropzoneHint")}
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
            >
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm truncate">{file.fileName}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {formatFileSize(file.fileSize)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => removeFile(idx)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MIXED Editor ─────────────────────────────────────────────────────

interface MixedContent {
  html: string;
  videoUrl: string;
  files: FileEntry[];
}

function parseMixedContent(content: string): MixedContent {
  if (!content) return { html: "", videoUrl: "", files: [] };
  try {
    const parsed = JSON.parse(content);
    return {
      html: parsed.html || "",
      videoUrl: parsed.videoUrl || "",
      files: Array.isArray(parsed.files) ? parsed.files : [],
    };
  } catch {
    // Backwards compat: treat plain text as html
    return { html: content, videoUrl: "", files: [] };
  }
}

function MixedEditor({
  content,
  onChange,
  videoSourceType,
  onVideoSourceTypeChange,
  sectionId,
  videoBlobUrl,
  videoFileName,
  videoSize,
  cloudflareStreamUid,
  videoStatus,
  onVideoUploaded,
}: {
  content: string;
  onChange: (value: string) => void;
  videoSourceType: VideoSourceType;
  onVideoSourceTypeChange: (v: VideoSourceType) => void;
  sectionId: string | null;
  videoBlobUrl: string | null;
  videoFileName: string | null;
  videoSize: number | null;
  cloudflareStreamUid: string | null;
  videoStatus: "PENDING" | "READY" | "ERROR" | null;
  onVideoUploaded?: () => void;
}) {
  const mixed = useMemo(() => parseMixedContent(content), [content]);

  function updateField(field: keyof MixedContent, value: string | FileEntry[]) {
    const updated = { ...mixed, [field]: value };
    onChange(JSON.stringify(updated));
  }

  return (
    <div className="space-y-6">
      <TextEditor
        content={mixed.html}
        onChange={(html) => updateField("html", html)}
      />
      <Separator />
      <VideoEditor
        content={mixed.videoUrl}
        onChange={(url) => updateField("videoUrl", url)}
        videoSourceType={videoSourceType}
        onVideoSourceTypeChange={onVideoSourceTypeChange}
        sectionId={sectionId}
        videoBlobUrl={videoBlobUrl}
        videoFileName={videoFileName}
        videoSize={videoSize}
        cloudflareStreamUid={cloudflareStreamUid}
        videoStatus={videoStatus}
        onVideoUploaded={onVideoUploaded}
      />
      <Separator />
      <AttachmentEditor
        content={JSON.stringify(mixed.files)}
        onChange={(filesJson) => {
          const files = parseFiles(filesJson);
          updateField("files", files);
        }}
      />
    </div>
  );
}
