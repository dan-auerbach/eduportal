"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { ImagePlus, X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { toast } from "sonner";

const ACCEPTED_TYPES = ".jpg,.jpeg,.png,.svg";
const MAX_SIZE_KB = 2000;
const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;

interface CoverImageUploadProps {
  currentImage: string | null;
  onImageChange: (url: string | null) => void;
}

export function CoverImageUpload({
  currentImage,
  onImageChange,
}: CoverImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(t("admin.editor.coverImageTooLarge", { maxSize: MAX_SIZE_KB }));
      return;
    }

    const ext = file.name.toLowerCase().split(".").pop();
    if (!["jpg", "jpeg", "png", "svg"].includes(ext || "")) {
      toast.error(t("admin.editor.coverImageInvalidFormat"));
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/cover-upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error || t("common.uploadError"));
        return;
      }

      setPreviewUrl(json.coverUrl);
      onImageChange(json.coverUrl);
      toast.success(t("admin.editor.coverImageSuccess"));
    } catch {
      toast.error(t("admin.editor.coverImageUploadError"));
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-uploaded
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleRemove() {
    setPreviewUrl(null);
    onImageChange(null);
    toast.success(t("admin.editor.coverImageRemoved"));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{t("admin.editor.coverImage")}</Label>

      {previewUrl ? (
        /* Preview with remove button */
        <div className="relative group rounded-lg overflow-hidden border border-border/60">
          <div className="aspect-[16/9] relative bg-muted">
            {previewUrl.endsWith(".svg") ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={previewUrl}
                alt={t("admin.editor.coverPreviewAlt")}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <Image
                src={previewUrl}
                alt={t("admin.editor.coverPreviewAlt")}
                fill
                className="object-cover"
                sizes="400px"
                unoptimized={previewUrl.startsWith("/api/")}
              />
            )}
            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shadow-md"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {t("admin.editor.coverImageUpload")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="shadow-md"
                  onClick={handleRemove}
                  disabled={uploading}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  {t("admin.editor.coverImageRemove")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty state — drop zone */
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className={cn(
            "w-full aspect-[16/9] rounded-lg border-2 border-dashed border-border/60",
            "flex flex-col items-center justify-center gap-2",
            "text-muted-foreground hover:border-primary/40 hover:bg-muted/30",
            "transition-colors cursor-pointer",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="text-sm font-medium">{t("admin.editor.coverImageUploading")}</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-8 w-8 opacity-40" />
              <span className="text-sm font-medium">{t("admin.editor.coverImageUpload")}</span>
              <span className="text-xs opacity-60">{t("admin.editor.coverImageHint")}</span>
            </>
          )}
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
