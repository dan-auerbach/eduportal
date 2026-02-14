"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface MentorComboboxProps {
  candidates: Candidate[];
  selectedIds: Set<string>;
  onToggle: (userId: string) => void;
  disabled?: boolean;
}

export function MentorCombobox({
  candidates,
  selectedIds,
  onToggle,
  disabled,
}: MentorComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedCandidates = candidates.filter((c) => selectedIds.has(c.id));

  return (
    <div className="space-y-3">
      {/* Selected mentors as badges */}
      {selectedCandidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCandidates.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 pr-1">
              {c.firstName} {c.lastName}
              <button
                onClick={() => !disabled && onToggle(c.id)}
                disabled={disabled}
                className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Search combobox */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between text-muted-foreground font-normal"
            disabled={disabled}
          >
            {selectedIds.size > 0
              ? t("admin.editor.mentorSelected", { count: selectedIds.size })
              : t("admin.editor.mentorSearch")}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t("admin.editor.mentorSearch")} />
            <CommandList>
              <CommandEmpty>{t("admin.editor.mentorNoResults")}</CommandEmpty>
              <CommandGroup>
                {candidates.map((c) => {
                  const isSelected = selectedIds.has(c.id);
                  const fullName = `${c.firstName} ${c.lastName}`;
                  return (
                    <CommandItem
                      key={c.id}
                      value={`${fullName} ${c.email}`}
                      onSelect={() => {
                        onToggle(c.id);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{fullName}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.email}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
