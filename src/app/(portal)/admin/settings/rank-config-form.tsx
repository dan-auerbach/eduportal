"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenantConfig } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";
import { t } from "@/lib/i18n";
import { DEFAULT_TENANT_CONFIG, type RankThreshold } from "@/lib/tenant-config";
import type { ReputationRank } from "@/generated/prisma/client";

const RANK_ORDER: ReputationRank[] = ["VAJENEC", "POMOCNIK", "MOJSTER", "MENTOR"];

interface RankConfigFormProps {
  rankThresholds: RankThreshold[];
}

export function RankConfigForm({ rankThresholds }: RankConfigFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [thresholds, setThresholds] = useState<RankThreshold[]>(
    RANK_ORDER.map((rank) => {
      const found = rankThresholds.find((r) => r.rank === rank);
      return found ?? { rank, minXp: 0, label: rank };
    }),
  );

  function updateThreshold(index: number, field: "label" | "minXp", value: string) {
    setThresholds((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === "minXp") {
          const num = parseInt(value, 10);
          return { ...item, minXp: isNaN(num) ? 0 : Math.max(0, num) };
        }
        return { ...item, [field]: value };
      }),
    );
  }

  function resetDefaults() {
    setThresholds(
      RANK_ORDER.map((rank) => {
        const found = DEFAULT_TENANT_CONFIG.rankThresholds.find((r) => r.rank === rank);
        return found ?? { rank, minXp: 0, label: rank };
      }),
    );
  }

  function validate(): string | null {
    for (const th of thresholds) {
      if (!th.label.trim()) return `Rang ${th.rank} mora imeti ime`;
    }
    // First rank must be 0
    if (thresholds[0].minXp !== 0) return "Prvi rang mora imeti prag 0 XP";
    // Thresholds must be ascending
    for (let i = 1; i < thresholds.length; i++) {
      if (thresholds[i].minXp <= thresholds[i - 1].minXp) {
        return "Pragovi morajo naraščati";
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setLoading(true);

    const result = await updateTenantConfig({
      rankThresholds: thresholds.map((th) => ({
        rank: th.rank,
        minXp: th.minXp,
        label: th.label.trim(),
      })),
    });

    if (result.success) {
      toast.success(t("tenant.updated"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Rangi</h4>
        <Button type="button" variant="ghost" size="sm" onClick={resetDefaults} className="h-7 text-xs">
          <RotateCcw className="mr-1 h-3 w-3" />
          Ponastavi na privzeto
        </Button>
      </div>

      <div className="rounded-lg border">
        <div className="grid grid-cols-[80px_1fr_100px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>Rang</span>
          <span>Prikazano ime</span>
          <span className="text-right">Prag XP</span>
        </div>
        {thresholds.map((th, i) => (
          <div
            key={th.rank}
            className="grid grid-cols-[80px_1fr_100px] items-center gap-2 border-b px-3 py-2 last:border-b-0"
          >
            <span className="text-xs font-mono text-muted-foreground">{th.rank}</span>
            <Input
              value={th.label}
              onChange={(e) => updateThreshold(i, "label", e.target.value)}
              className="h-8 text-sm"
              maxLength={50}
            />
            <Input
              type="number"
              min={0}
              value={th.minXp}
              onChange={(e) => updateThreshold(i, "minXp", e.target.value)}
              className="h-8 text-right text-sm tabular-nums"
              disabled={i === 0} // first rank is always 0
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Rang enum vrednosti (VAJENEC, POMOCNIK...) ostanejo fiksne. Prilagodite prikazana imena in pragove XP.
      </p>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
