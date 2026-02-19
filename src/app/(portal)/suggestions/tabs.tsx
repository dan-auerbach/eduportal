"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type SuggestionTabsProps = {
  currentSort: string;
  currentStatus?: string;
};

export function SuggestionTabs({ currentSort, currentStatus }: SuggestionTabsProps) {
  const sortTabs = [
    { key: "popular", label: t("suggestions.sortPopular") },
    { key: "newest", label: t("suggestions.sortNewest") },
  ];

  function buildHref(sort: string, status?: string) {
    const params = new URLSearchParams();
    if (sort !== "popular") params.set("sort", sort);
    if (status) params.set("status", status);
    const qs = params.toString();
    return `/suggestions${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {sortTabs.map((tab) => (
        <Link
          key={tab.key}
          href={buildHref(tab.key, currentStatus)}
          className={cn(
            "relative px-4 py-2.5 text-sm font-medium transition-colors",
            currentSort === tab.key
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {currentSort === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </Link>
      ))}
    </div>
  );
}
