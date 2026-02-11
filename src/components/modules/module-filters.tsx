"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, SlidersHorizontal } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { t } from "@/lib/i18n";

type ModuleFiltersProps = {
  availableTags: string[];
  currentSearch: string;
  currentDifficulty: string;
  currentTag: string;
  currentSort: string;
};

// Shared filter dropdowns used in both desktop and mobile sheet
function FilterSelects({
  difficulty,
  tag,
  sort,
  availableTags,
  onDifficultyChange,
  onTagChange,
  onSortChange,
  className,
}: {
  difficulty: string;
  tag: string;
  sort: string;
  availableTags: string[];
  onDifficultyChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onSortChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <Select value={difficulty || "all"} onValueChange={onDifficultyChange}>
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

      <Select value={tag || "all"} onValueChange={onTagChange}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t("modules.filterTag")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("modules.allTags")}</SelectItem>
          {availableTags.map((tagName) => (
            <SelectItem key={tagName} value={tagName}>
              {tagName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort || "recommended"} onValueChange={onSortChange}>
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
  );
}

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

  // Mobile sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingDifficulty, setPendingDifficulty] = useState(currentDifficulty);
  const [pendingTag, setPendingTag] = useState(currentTag);
  const [pendingSort, setPendingSort] = useState(currentSort || "recommended");

  // Sync pending state when sheet opens
  useEffect(() => {
    if (sheetOpen) {
      setPendingDifficulty(currentDifficulty);
      setPendingTag(currentTag);
      setPendingSort(currentSort || "recommended");
    }
  }, [sheetOpen, currentDifficulty, currentTag, currentSort]);

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

  // Apply mobile filters
  const applyMobileFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (pendingDifficulty && pendingDifficulty !== "all") {
      params.set("difficulty", pendingDifficulty);
    } else {
      params.delete("difficulty");
    }
    if (pendingTag && pendingTag !== "all") {
      params.set("tag", pendingTag);
    } else {
      params.delete("tag");
    }
    if (pendingSort && pendingSort !== "recommended") {
      params.set("sort", pendingSort);
    } else {
      params.delete("sort");
    }
    router.push(`/modules?${params.toString()}`);
    setSheetOpen(false);
  }, [router, searchParams, pendingDifficulty, pendingTag, pendingSort]);

  const clearMobileFilters = useCallback(() => {
    setPendingDifficulty("");
    setPendingTag("");
    setPendingSort("recommended");
    setSearch("");
    router.push("/modules");
    setSheetOpen(false);
  }, [router]);

  const hasFilters = currentSearch || currentDifficulty || currentTag || (currentSort && currentSort !== "recommended");

  // Count of active non-search filters (for mobile badge)
  const activeFilterCount = [
    currentDifficulty,
    currentTag,
    currentSort && currentSort !== "recommended" ? currentSort : "",
  ].filter(Boolean).length;

  return (
    <div className="space-y-3">
      {/* ─── Search + Desktop Filters ─── */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("modules.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Desktop: inline dropdowns */}
        <FilterSelects
          difficulty={currentDifficulty}
          tag={currentTag}
          sort={currentSort}
          availableTags={availableTags}
          onDifficultyChange={(v) => updateParam("difficulty", v)}
          onTagChange={(v) => updateParam("tag", v)}
          onSortChange={(v) => updateParam("sort", v)}
          className="hidden md:flex gap-3"
        />

        {/* Mobile: filter button → bottom sheet */}
        <Button
          variant="outline"
          size="icon"
          className="md:hidden shrink-0 relative"
          onClick={() => setSheetOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {/* ─── Mobile Bottom Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>{t("modules.filtersButton")}</SheetTitle>
          </SheetHeader>

          <div className="px-4 pb-2">
            <FilterSelects
              difficulty={pendingDifficulty}
              tag={pendingTag}
              sort={pendingSort}
              availableTags={availableTags}
              onDifficultyChange={setPendingDifficulty}
              onTagChange={setPendingTag}
              onSortChange={setPendingSort}
              className="flex flex-col gap-3"
            />
          </div>

          <SheetFooter className="flex-row gap-3">
            <Button variant="outline" className="flex-1" onClick={clearMobileFilters}>
              {t("modules.clearFilters")}
            </Button>
            <Button className="flex-1" onClick={applyMobileFilters}>
              {t("modules.applyFilters")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ─── Active Filters Badges ─── */}
      {hasFilters && (
        <div className="flex items-center gap-2 flex-wrap">
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
