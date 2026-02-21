"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenantConfig } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { t } from "@/lib/i18n";
import type { TenantFeatures } from "@/lib/tenant-config";

const FEATURE_ITEMS: { key: keyof TenantFeatures; label: string; desc: string }[] = [
  { key: "chat", label: "Klepet", desc: "Skupinski klepet za zaposlene" },
  { key: "suggestions", label: "Predlogi znanj", desc: "Zaposleni lahko predlagajo nova znanja" },
  { key: "leaderboard", label: "Lestvica", desc: "XP lestvica med zaposlenimi" },
  { key: "rewards", label: "Nagrade", desc: "Nagradna trgovina za XP točke" },
  { key: "radar", label: "Radar znanj", desc: "Vizualizacija znanj po skupinah" },
  { key: "liveEvents", label: "Mentor v živo", desc: "Dogodki in prisotnost v živo" },
  { key: "aiBuilder", label: "AI gradnik", desc: "AI pomočnik za ustvarjanje vsebin" },
];

interface FeatureTogglesFormProps {
  features: TenantFeatures;
}

export function FeatureTogglesForm({ features }: FeatureTogglesFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<TenantFeatures>(features);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const result = await updateTenantConfig({ features: state });

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
      <div className="space-y-3">
        {FEATURE_ITEMS.map((item) => (
          <div key={item.key} className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor={`feature-${item.key}`} className="text-sm font-medium">
                {item.label}
              </Label>
              <p className="text-xs text-muted-foreground">{item.desc}</p>
            </div>
            <Switch
              id={`feature-${item.key}`}
              checked={state[item.key]}
              onCheckedChange={(checked) =>
                setState((prev) => ({ ...prev, [item.key]: checked }))
              }
            />
          </div>
        ))}
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
