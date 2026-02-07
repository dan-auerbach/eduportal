"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface CategoryTabBarProps {
  categories: { id: string; name: string }[];
  currentCategory: string;
}

export function CategoryTabBar({ categories, currentCategory }: CategoryTabBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = useCallback(
    (categoryId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (categoryId) {
        params.set("category", categoryId);
      } else {
        params.delete("category");
      }
      // Reset to first page when changing category
      params.delete("page");
      router.push(`/modules?${params.toString()}`);
    },
    [router, searchParams]
  );

  if (categories.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => handleSelect("")}
        className={cn(
          "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
          !currentCategory
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        )}
      >
        {t("modules.allCategories")}
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => handleSelect(cat.id)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
            currentCategory === cat.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
