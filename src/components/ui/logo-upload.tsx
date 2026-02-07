"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/i18n";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/svg+xml"];
const MAX_SIZE = 500 * 1024; // 500 KB

interface LogoUploadProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

export function LogoUpload({ value, onChange }: LogoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      // Client-side validation
      if (!ACCEPTED_TYPES.includes(file.type)) {
        toast.error(t("tenant.logoHint"));
        return;
      }
      if (file.size > MAX_SIZE) {
        toast.error(t("tenant.logoHint"));
        return;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/logo-upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          toast.error(data.error || t("common.uploadError"));
          return;
        }

        onChange(data.logoUrl);
      } catch {
        toast.error(t("tenant.logoUploadError"));
      } finally {
        setUploading(false);
      }
    },
    [onChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadFile(file);
      }
      // Reset input so same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        uploadFile(file);
      }
    },
    [uploadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
            <img
              src={value}
              alt={t("tenant.logoAlt")}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("tenant.logoUploading")}
                </>
              ) : (
                t("tenant.logoUpload")
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground justify-start px-2 h-auto py-1"
              onClick={() => onChange(null)}
            >
              <X className="mr-1 h-3 w-3" />
              {t("tenant.logoRemove")}
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 transition-colors cursor-pointer ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
          ) : (
            <Upload className="h-6 w-6 text-muted-foreground mb-2" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? t("tenant.logoUploading") : t("tenant.logoDropHint")}
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {t("tenant.logoHint")}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.svg"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
