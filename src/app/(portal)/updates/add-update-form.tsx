"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { t } from "@/lib/i18n";

export function AddUpdateForm() {
  const router = useRouter();
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!version.trim() || !title.trim() || !summary.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/updates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: version.trim(), title: title.trim(), summary: summary.trim() }),
      });

      if (res.ok) {
        toast.success(t("updates.updateAdded"));
        setVersion("");
        setTitle("");
        setSummary("");
        router.refresh();
      } else {
        toast.error(t("updates.updateError"));
      }
    } catch {
      toast.error(t("updates.updateError"));
    }
    setLoading(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("updates.addUpdate")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-end gap-3">
          <div className="space-y-1 w-full sm:w-32">
            <Label className="text-xs">{t("updates.versionLabel")}</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder={t("updates.versionPlaceholder")}
              required
            />
          </div>
          <div className="space-y-1 w-full sm:w-48">
            <Label className="text-xs">{t("updates.titleLabel")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("updates.titlePlaceholder")}
              required
            />
          </div>
          <div className="space-y-1 flex-1 w-full">
            <Label className="text-xs">{t("updates.summaryLabel")}</Label>
            <Input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t("updates.descriptionPlaceholder")}
              required
            />
          </div>
          <Button type="submit" disabled={loading} className="shrink-0">
            <Plus className="mr-1 h-4 w-4" />
            {t("updates.addUpdate")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
