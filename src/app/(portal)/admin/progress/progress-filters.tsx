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
import { t } from "@/lib/i18n";

interface ProgressFiltersProps {
  groups: { id: string; name: string }[];
  modules: { id: string; title: string }[];
  selectedGroup: string;
  selectedModule: string;
  selectedStatus: string;
}

export function ProgressFilters({
  groups,
  modules,
  selectedGroup,
  selectedModule,
  selectedStatus,
}: ProgressFiltersProps) {
  const router = useRouter();

  function handleFilterChange(key: string, value: string) {
    const current: Record<string, string> = {
      group: selectedGroup,
      module: selectedModule,
      status: selectedStatus,
    };
    current[key] = value === "all" ? "" : value;

    const params = new URLSearchParams();
    if (current.group) params.set("group", current.group);
    if (current.module) params.set("module", current.module);
    if (current.status) params.set("status", current.status);

    router.push(`/admin/progress?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label>{t("admin.progress.filterByGroup")}</Label>
        <Select
          value={selectedGroup || "all"}
          onValueChange={(v) => handleFilterChange("group", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("admin.progress.allGroups")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.progress.allGroups")}</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("admin.progress.filterByModule")}</Label>
        <Select
          value={selectedModule || "all"}
          onValueChange={(v) => handleFilterChange("module", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("admin.progress.allModules")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.progress.allModules")}</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("admin.progress.filterByStatus")}</Label>
        <Select
          value={selectedStatus || "all"}
          onValueChange={(v) => handleFilterChange("status", v)}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t("admin.progress.statusAll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.progress.statusAll")}</SelectItem>
            <SelectItem value="inactive7d">{t("admin.progress.statusInactive7d")}</SelectItem>
            <SelectItem value="in_progress">{t("admin.progress.statusInProgress")}</SelectItem>
            <SelectItem value="completed">{t("admin.progress.statusCompleted")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
