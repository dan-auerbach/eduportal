"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { t } from "@/lib/i18n";

type ManagerFiltersProps = {
  groups: { id: string; name: string }[];
  currentGroup: string;
};

export function ManagerFilters({ groups, currentGroup }: ManagerFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleGroupChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("group");
    } else {
      params.set("group", value);
    }
    const qs = params.toString();
    router.push(`/admin${qs ? `?${qs}` : ""}`);
  }

  if (groups.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <Select value={currentGroup || "all"} onValueChange={handleGroupChange}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder={t("manager.allGroups")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("manager.allGroups")}</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
