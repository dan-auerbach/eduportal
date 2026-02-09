"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export function RadarTabs({ isAdmin }: { isAdmin: boolean }) {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "approved";

  const tabs = [
    { key: "approved", label: t("radar.tabApproved") },
    { key: "my", label: t("radar.tabMyPosts") },
    ...(isAdmin
      ? [{ key: "pending", label: t("radar.tabPending") }]
      : []),
  ];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={`/radar?tab=${tab.key}`}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === tab.key
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
