"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface ProgressFiltersProps {
  groups: { id: string; name: string }[];
  modules: { id: string; title: string }[];
  selectedGroup: string;
  selectedModule: string;
}

export function ProgressFilters({
  groups,
  modules,
  selectedGroup,
  selectedModule,
}: ProgressFiltersProps) {
  const router = useRouter();

  function handleFilterChange(key: string, value: string) {
    const params = new URLSearchParams();
    if (key === "group") {
      if (value && value !== "all") params.set("group", value);
      if (selectedModule) params.set("module", selectedModule);
    } else {
      if (selectedGroup) params.set("group", selectedGroup);
      if (value && value !== "all") params.set("module", value);
    }
    router.push(`/admin/progress?${params.toString()}`);
  }

  return (
    <div className="flex items-end gap-4">
      <div className="space-y-2">
        <Label>Filter by Group</Label>
        <Select
          value={selectedGroup || "all"}
          onValueChange={(v) => handleFilterChange("group", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Filter by Module</Label>
        <Select
          value={selectedModule || "all"}
          onValueChange={(v) => handleFilterChange("module", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
