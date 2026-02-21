"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { Flame, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type SuggestionTabsProps = {
  currentSort: string;
  currentStatus?: string;
};

export function SuggestionTabs({ currentSort, currentStatus }: SuggestionTabsProps) {
  const sortTabs: { key: string; label: string; icon: LucideIcon }[] = [
    { key: "popular", label: t("suggestions.sortPopular"), icon: Flame },
    { key: "newest", label: t("suggestions.sortNewest"), icon: Clock },
  ];

  function buildHref(sort: string, status?: string) {
    const params = new URLSearchParams();
    if (sort !== "popular") params.set("sort", sort);
    if (status) params.set("status", status);
    const qs = params.toString();
    return `/suggestions${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex items-center gap-2 border-b border-border">
      {sortTabs.map((tab) => (
        <Link
          key={tab.key}
          href={buildHref(tab.key, currentStatus)}
          className={cn(
            "relative flex items-center gap-1.5 px-4 py-3 text-sm font-semibold transition-colors",
            currentSort === tab.key
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <tab.icon className="h-3.5 w-3.5" />
          {tab.label}
          {currentSort === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </Link>
      ))}
    </div>
  );
}
