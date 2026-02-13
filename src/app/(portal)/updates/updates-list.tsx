"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { t } from "@/lib/i18n";
import { DeleteUpdateButton } from "./delete-update-button";

export interface UpdateEntry {
  id: string;
  version: string;
  title: string;
  summary: string;
  isCurrent: boolean;
  time: string; // formatted time, e.g. "14:32"
}

export interface DayGroup {
  date: string; // yyyy-MM-dd key
  formattedDate: string; // localized, e.g. "12. februar 2026"
  entries: UpdateEntry[];
  hasCurrentEntry: boolean;
}

interface UpdatesListProps {
  groups: DayGroup[];
  isOwner: boolean;
}

export function UpdatesList({ groups, isOwner }: UpdatesListProps) {
  // First group (most recent day) starts expanded if it has the current entry
  const [openDays, setOpenDays] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (groups.length > 0 && groups[0].hasCurrentEntry) {
      initial[groups[0].date] = true;
    }
    return initial;
  });

  const toggleDay = (date: string) => {
    setOpenDays((prev) => ({ ...prev, [date]: !prev[date] }));
  };

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isOpen = openDays[group.date] ?? false;
        const highlight = group.entries[0]; // newest entry that day

        return (
          <Collapsible
            key={group.date}
            open={isOpen}
            onOpenChange={() => toggleDay(group.date)}
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isOpen ? "rotate-90" : ""
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      {group.formattedDate}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({group.entries.length})
                    </span>
                    {group.hasCurrentEntry && (
                      <Badge className="shrink-0">
                        {t("updates.currentVersion")}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {highlight.title}
                    {highlight.summary !== highlight.title && (
                      <>
                        <span className="mx-1">—</span>
                        {highlight.summary}
                      </>
                    )}
                  </p>
                </div>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="ml-4 border-l-2 border-muted pl-4 mt-1 space-y-1">
                {group.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-md px-3 py-2 text-sm flex items-start gap-3 ${
                      entry.isCurrent
                        ? "border-2 border-primary/20 bg-primary/[0.02]"
                        : "border"
                    }`}
                  >
                    <p className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {entry.time}
                      </span>
                      <span className="font-semibold mr-1">
                        {entry.version}
                      </span>
                      <span className="text-muted-foreground mx-1">—</span>
                      <span className="font-medium mr-1">{entry.title}</span>
                      <span className="text-muted-foreground mx-1">—</span>
                      <span className={entry.isCurrent ? "" : "text-muted-foreground"}>
                        {entry.summary}
                      </span>
                    </p>
                    {isOwner && <DeleteUpdateButton entryId={entry.id} />}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
