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

interface LateUserFiltersProps {
  allGroups: { id: string; name: string }[];
  allModules: { id: string; title: string }[];
  currentGroup: string;
  currentModule: string;
  currentReason: string;
}

export function LateUserFilters({
  allGroups,
  allModules,
  currentGroup,
  currentModule,
  currentReason,
}: LateUserFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/admin/late-users?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3">
      <Select
        value={currentGroup || "all"}
        onValueChange={(v) => updateFilter("group", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("admin.lateUsers.filterByGroup")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("admin.lateUsers.allGroups")}</SelectItem>
          {allGroups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentModule || "all"}
        onValueChange={(v) => updateFilter("module", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("admin.lateUsers.filterByModule")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("admin.lateUsers.allModules")}</SelectItem>
          {allModules.map((mod) => (
            <SelectItem key={mod.id} value={mod.id}>
              {mod.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentReason || "all"}
        onValueChange={(v) => updateFilter("reason", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("admin.lateUsers.filterByReason")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("admin.lateUsers.allReasons")}</SelectItem>
          <SelectItem value="NOT_STARTED">
            {t("admin.lateUsers.reasons.NOT_STARTED")}
          </SelectItem>
          <SelectItem value="IN_PROGRESS">
            {t("admin.lateUsers.reasons.IN_PROGRESS")}
          </SelectItem>
          <SelectItem value="MISSING_QUIZ">
            {t("admin.lateUsers.reasons.MISSING_QUIZ")}
          </SelectItem>
          <SelectItem value="INACTIVE">
            {t("admin.lateUsers.reasons.INACTIVE")}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
