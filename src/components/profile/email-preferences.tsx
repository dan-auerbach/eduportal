"use client";

import { useState, useEffect } from "react";
import { getEmailPreferences, updateEmailPreferences } from "@/actions/email";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";

type Prefs = {
  mentorQuestion: string;
  liveTrainingReminder: boolean;
  newKnowledgeDigest: string;
  securityNotices: boolean;
};

export function EmailPreferences() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({
    mentorQuestion: "INSTANT",
    liveTrainingReminder: true,
    newKnowledgeDigest: "DAILY",
    securityNotices: true,
  });

  useEffect(() => {
    getEmailPreferences().then((result) => {
      if (result.success) {
        setPrefs(result.data);
      }
      setLoading(false);
    });
  }, []);

  async function update(key: keyof Prefs, value: string | boolean) {
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);
    setSaving(true);

    const result = await updateEmailPreferences({ [key]: value });

    if (result.success) {
      toast.success(t("emailPreferences.saved"));
    } else {
      // Revert on error
      setPrefs(prefs);
      toast.error(result.error);
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mentor questions */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t("emailPreferences.mentorQuestion")}</Label>
          <p className="text-xs text-muted-foreground">{t("emailPreferences.mentorQuestionDesc")}</p>
        </div>
        <Select
          value={prefs.mentorQuestion}
          onValueChange={(v) => update("mentorQuestion", v)}
          disabled={saving}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="INSTANT">{t("emailPreferences.instant")}</SelectItem>
            <SelectItem value="MUTED">{t("emailPreferences.muted")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Live training reminders */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t("emailPreferences.liveReminder")}</Label>
          <p className="text-xs text-muted-foreground">{t("emailPreferences.liveReminderDesc")}</p>
        </div>
        <Switch
          checked={prefs.liveTrainingReminder}
          onCheckedChange={(v) => update("liveTrainingReminder", v)}
          disabled={saving}
        />
      </div>

      {/* New knowledge digest */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t("emailPreferences.knowledgeDigest")}</Label>
          <p className="text-xs text-muted-foreground">{t("emailPreferences.knowledgeDigestDesc")}</p>
        </div>
        <Select
          value={prefs.newKnowledgeDigest}
          onValueChange={(v) => update("newKnowledgeDigest", v)}
          disabled={saving}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DAILY">{t("emailPreferences.daily")}</SelectItem>
            <SelectItem value="INSTANT">{t("emailPreferences.instant")}</SelectItem>
            <SelectItem value="MUTED">{t("emailPreferences.muted")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Security notices */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t("emailPreferences.securityNotices")}</Label>
          <p className="text-xs text-muted-foreground">{t("emailPreferences.securityNoticesDesc")}</p>
        </div>
        <Switch
          checked={prefs.securityNotices}
          onCheckedChange={(v) => update("securityNotices", v)}
          disabled={saving}
        />
      </div>
    </div>
  );
}
