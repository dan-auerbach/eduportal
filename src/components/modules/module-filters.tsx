"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";

type ModuleFiltersProps = {
  availableTags: string[];
  currentSearch: string;
  currentDifficulty: string;
  currentTag: string;
  currentSort: string;
};

export function ModuleFilters({
  availableTags,
  currentSearch,
  currentDifficulty,
  currentTag,
  currentSort,
}: ModuleFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (search) {
        params.set("q", search);
      } else {
        params.delete("q");
      }
      router.push(`/modules?${params.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all" && value !== "recommended") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/modules?${params.toString()}`);
    },
    [router, searchParams]
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    router.push("/modules");
  }, [router]);

  const hasFilters = currentSearch || currentDifficulty || currentTag || (currentSort && currentSort !== "recommended");

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("modules.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={currentDifficulty || "all"}
          onValueChange={(value) => updateParam("difficulty", value)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t("modules.filterDifficulty")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modules.allDifficulties")}</SelectItem>
            <SelectItem value="BEGINNER">{t("difficulty.BEGINNER")}</SelectItem>
            <SelectItem value="INTERMEDIATE">{t("difficulty.INTERMEDIATE")}</SelectItem>
            <SelectItem value="ADVANCED">{t("difficulty.ADVANCED")}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={currentTag || "all"}
          onValueChange={(value) => updateParam("tag", value)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t("modules.filterTag")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modules.allTags")}</SelectItem>
            {availableTags.map((tag) => (
              <SelectItem key={tag} value={tag}>
                {tag}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={currentSort || "recommended"}
          onValueChange={(value) => updateParam("sort", value)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t("modules.sortBy")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recommended">{t("modules.sortRecommended")}</SelectItem>
            <SelectItem value="deadline">{t("modules.sortDeadline")}</SelectItem>
            <SelectItem value="progress">{t("modules.sortProgress")}</SelectItem>
            <SelectItem value="title">{t("modules.sortTitle")}</SelectItem>
            <SelectItem value="category">{t("modules.sortCategory")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasFilters && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("common.activeFilters")}</span>
          {currentSearch && (
            <Badge variant="secondary">
              {t("modules.searchLabel", { term: currentSearch })}
            </Badge>
          )}
          {currentDifficulty && (
            <Badge variant="secondary">
              {currentDifficulty}
            </Badge>
          )}
          {currentTag && (
            <Badge variant="secondary">
              {currentTag}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-6 px-2 text-xs"
          >
            <X className="h-3 w-3 mr-1" />
            {t("common.clearAll")}
          </Button>
        </div>
      )}
    </div>
  );
}
