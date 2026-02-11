"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export function CompletedSection({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg px-4 py-3 text-left transition-colors",
          "border border-border/40 bg-muted/20 hover:bg-muted/40"
        )}
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <span className="text-sm font-medium text-muted-foreground flex-1">
          {t("modules.completedCount", { count: String(count) })}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {isOpen && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
