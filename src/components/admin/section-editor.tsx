"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  updateSection,
  deleteSection,
  duplicateSection,
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
import type { SectionType } from "@/generated/prisma/client";
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const savedValuesRef = useRef({
    title: "",
    content: "",
    type: "TEXT" as SectionType,
    unlockAfter: "none",
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
      setSaveStatus("saved");
      savedValuesRef.current = {
        title: section.title,
        content: section.content,
        type: section.type,
        unlockAfter: section.unlockAfterSectionId || "none",
      };
      sectionIdRef.current = section.id;
    }
  }, [section]);

  const isDirty = useCallback(() => {
    return (
      localTitle !== savedValuesRef.current.title ||
      localContent !== savedValuesRef.current.content ||
      localType !== savedValuesRef.current.type ||
      localUnlockAfter !== savedValuesRef.current.unlockAfter
    );
  }, [localTitle, localContent, localType, localUnlockAfter]);

  const handleSave = useCallback(async () => {
    if (!sectionIdRef.current) return;
    if (!isDirty()) return;

    setSaveStatus("saving");

    const data = {
      title: localTitle,
      content: localContent,
      type: localType,
      unlockAfterSectionId:
        localUnlockAfter === "none" ? null : localUnlockAfter,
    };

    const result = await updateSection(sectionIdRef.current, data);

    if (result.success) {
      setSaveStatus("saved");
      savedValuesRef.current = {
        title: localTitle,
        content: localContent,
        type: localType,
        unlockAfter: localUnlockAfter,
      };
      router.refresh();
    } else {
      setSaveStatus("unsaved");
      toast.error(result.error);
    }
  }, [localTitle, localContent, localType, localUnlockAfter, isDirty, router]);

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
  }, [localTitle, localContent, localType, localUnlockAfter, section, isDirty, handleSave]);

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
            <Button size="sm" onClick={handleSave} disabled={saveStatus === "saving"}>
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
}: {
  type: SectionType;
  content: string;
  onChange: (value: string) => void;
}) {
  switch (type) {
    case "TEXT":
      return <TextEditor content={content} onChange={onChange} />;
    case "VIDEO":
      return <VideoEditor content={content} onChange={onChange} />;
    case "ATTACHMENT":
      return <AttachmentEditor content={content} onChange={onChange} />;
    case "MIXED":
      return <MixedEditor content={content} onChange={onChange} />;
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
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  const videoId = useMemo(() => extractYouTubeId(content), [content]);

  return (
    <div className="space-y-4">
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
            toast.error(errData?.error || "Upload failed");
          }
        } catch {
          toast.error("Upload failed");
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
}: {
  content: string;
  onChange: (value: string) => void;
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
