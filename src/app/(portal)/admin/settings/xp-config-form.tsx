"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenantConfig } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCcw } from "lucide-react";
import { t } from "@/lib/i18n";
import { DEFAULT_TENANT_CONFIG } from "@/lib/tenant-config";

const XP_SOURCE_ITEMS: { key: string; label: string; desc: string }[] = [
  { key: "MODULE_COMPLETED", label: "Zaključen modul", desc: "Ko uporabnik zaključi vse sekcije in kviz modula" },
  { key: "QUIZ_HIGH_SCORE", label: "Visok rezultat kviza", desc: "Bonus za dosežen visok rezultat na kvizu" },
  { key: "MENTOR_CONFIRMATION", label: "Potrditev mentorja", desc: "Ko mentor potrdi mentorsko vprašanje" },
  { key: "TOP_SUGGESTION", label: "Priljubljen predlog", desc: "Ko predlog doseže prag glasov" },
  { key: "SUGGESTION_CREATED", label: "Ustvarjen predlog", desc: "Ko uporabnik ustvari predlog znanja" },
  { key: "SUGGESTION_APPROVED", label: "Odobren predlog", desc: "Ko admin odobri predlog znanja" },
  { key: "EVENT_ATTENDED", label: "Prisotnost na dogodku", desc: "Ko je prisotnost na dogodku potrjena" },
  { key: "COMPLIANCE_RENEWAL", label: "Pravočasna obnovitev", desc: "Bonus za obnovitev certifikata pred iztekom" },
];

interface XpConfigFormProps {
  xpRules: Record<string, number>;
  quizHighScorePercent: number;
  suggestionVoteThreshold: number;
}

export function XpConfigForm({ xpRules, quizHighScorePercent, suggestionVoteThreshold }: XpConfigFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rules, setRules] = useState<Record<string, number>>({ ...xpRules });
  const [quizPct, setQuizPct] = useState(quizHighScorePercent);
  const [votePrag, setVotePrag] = useState(suggestionVoteThreshold);

  function updateRule(key: string, value: string) {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      setRules((prev) => ({ ...prev, [key]: num }));
    }
  }

  function resetDefaults() {
    setRules({ ...DEFAULT_TENANT_CONFIG.xpRules });
    setQuizPct(DEFAULT_TENANT_CONFIG.quizHighScorePercent);
    setVotePrag(DEFAULT_TENANT_CONFIG.suggestionVoteThreshold);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const result = await updateTenantConfig({
      xpRules: rules,
      quizHighScorePercent: quizPct,
      suggestionVoteThreshold: votePrag,
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* XP per action */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">XP pravila</h4>
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults} className="h-7 text-xs">
            <RotateCcw className="mr-1 h-3 w-3" />
            Ponastavi na privzeto
          </Button>
        </div>
        <div className="rounded-lg border">
          <div className="grid grid-cols-[1fr_100px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>Akcija</span>
            <span className="text-right">XP</span>
          </div>
          {XP_SOURCE_ITEMS.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-[1fr_100px] items-center gap-2 border-b px-3 py-2 last:border-b-0"
            >
              <div>
                <span className="text-sm font-medium">{item.label}</span>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Input
                type="number"
                min={0}
                max={10000}
                value={rules[item.key] ?? 0}
                onChange={(e) => updateRule(item.key, e.target.value)}
                className="h-8 text-right text-sm tabular-nums"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Thresholds */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quizPct">Prag za bonus kviza (%)</Label>
          <p className="text-xs text-muted-foreground">
            Minimalni rezultat kviza za bonus XP
          </p>
          <Input
            id="quizPct"
            type="number"
            min={50}
            max={100}
            value={quizPct}
            onChange={(e) => setQuizPct(parseInt(e.target.value, 10) || 90)}
            className="w-24"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="votePrag">Prag glasov za priljubljen predlog</Label>
          <p className="text-xs text-muted-foreground">
            Koliko glasov mora dobiti predlog za XP bonus
          </p>
          <Input
            id="votePrag"
            type="number"
            min={1}
            max={100}
            value={votePrag}
            onChange={(e) => setVotePrag(parseInt(e.target.value, 10) || 5)}
            className="w-24"
          />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
