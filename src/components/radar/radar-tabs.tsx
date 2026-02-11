"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export function RadarTabs() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "all";

  const tabs = [
    { key: "all", label: t("radar.tabAll") },
    { key: "saved", label: t("radar.tabSaved") },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-border">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.key === "all" ? "/radar" : `/radar?tab=${tab.key}`}
          className={cn(
            "px-4 py-2.5 text-sm font-medium transition-colors relative",
            activeTab === tab.key
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {tab.label}
          {activeTab === tab.key && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
          )}
        </Link>
      ))}
    </div>
  );
}
