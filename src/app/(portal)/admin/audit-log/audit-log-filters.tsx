"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { t } from "@/lib/i18n";

interface AuditLogFiltersProps {
  actions: string[];
  selectedAction: string;
  fromDate: string;
  toDate: string;
}

export function AuditLogFilters({
  actions,
  selectedAction,
  fromDate,
  toDate,
}: AuditLogFiltersProps) {
  const router = useRouter();

  function applyFilters(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const action = overrides.action ?? selectedAction;
    const from = overrides.from ?? fromDate;
    const to = overrides.to ?? toDate;

    if (action && action !== "all") params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", "1");

    router.push(`/admin/audit-log?${params.toString()}`);
  }

  function clearFilters() {
    router.push("/admin/audit-log");
  }

  const hasFilters = selectedAction || fromDate || toDate;

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label>{t("admin.auditLog.actionType")}</Label>
        <Select
          value={selectedAction || "all"}
          onValueChange={(v) => applyFilters({ action: v })}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={t("admin.auditLog.allActions")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.auditLog.allActions")}</SelectItem>
            {actions.map((action) => (
              <SelectItem key={action} value={action}>
                {t(`auditActions.${action}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("admin.auditLog.fromDate")}</Label>
        <Input
          type="date"
          value={fromDate}
          onChange={(e) => applyFilters({ from: e.target.value })}
          className="w-[180px]"
        />
      </div>
      <div className="space-y-2">
        <Label>{t("admin.auditLog.toDate")}</Label>
        <Input
          type="date"
          value={toDate}
          onChange={(e) => applyFilters({ to: e.target.value })}
          className="w-[180px]"
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          {t("admin.auditLog.clearFilters")}
        </Button>
      )}
    </div>
  );
}
