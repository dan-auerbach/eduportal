"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { updateTenantSettings, getEmailTemplates } from "@/actions/tenants";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2, RotateCcw } from "lucide-react";
import { t } from "@/lib/i18n";

const PLACEHOLDER_HELP = "{firstName}, {tenantName}, {link}";

export function EmailTemplatesForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Invite template
  const [inviteSubject, setInviteSubject] = useState("");
  const [inviteBody, setInviteBody] = useState("");

  // Reset template
  const [resetSubject, setResetSubject] = useState("");
  const [resetBody, setResetBody] = useState("");

  // Fetch current templates
  useEffect(() => {
    getEmailTemplates().then((result) => {
      if (result.success) {
        setInviteSubject(result.data.emailInviteSubject ?? "");
        setInviteBody(result.data.emailInviteBody ?? "");
        setResetSubject(result.data.emailResetSubject ?? "");
        setResetBody(result.data.emailResetBody ?? "");
      }
      setFetching(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const result = await updateTenantSettings({
      emailInviteSubject: inviteSubject || null,
      emailInviteBody: inviteBody || null,
      emailResetSubject: resetSubject || null,
      emailResetBody: resetBody || null,
    });

    if (result.success) {
      toast.success(t("emailTemplates.saved"));
      router.refresh();
    } else {
      toast.error(result.error);
    }

    setLoading(false);
  }

  function resetInvite() {
    setInviteSubject("");
    setInviteBody("");
  }

  function resetReset() {
    setResetSubject("");
    setResetBody("");
  }

  if (fetching) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t("emailTemplates.description")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("emailTemplates.placeholders")}: <code className="bg-muted px-1 rounded">{PLACEHOLDER_HELP}</code>
      </p>

      {/* Invite template */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{t("emailTemplates.inviteTitle")}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetInvite}
            className="h-7 text-xs"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("emailTemplates.resetDefault")}
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="inviteSubject">{t("emailTemplates.subject")}</Label>
          <Input
            id="inviteSubject"
            value={inviteSubject}
            onChange={(e) => setInviteSubject(e.target.value)}
            placeholder={t("emailTemplates.inviteSubjectPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inviteBody">{t("emailTemplates.body")}</Label>
          <Textarea
            id="inviteBody"
            value={inviteBody}
            onChange={(e) => setInviteBody(e.target.value)}
            placeholder={t("emailTemplates.inviteBodyPlaceholder")}
            rows={8}
            className="font-mono text-sm"
          />
        </div>
      </div>

      <Separator />

      {/* Reset template */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{t("emailTemplates.resetTitle")}</h4>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetReset}
            className="h-7 text-xs"
          >
            <RotateCcw className="mr-1 h-3 w-3" />
            {t("emailTemplates.resetDefault")}
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="resetSubject">{t("emailTemplates.subject")}</Label>
          <Input
            id="resetSubject"
            value={resetSubject}
            onChange={(e) => setResetSubject(e.target.value)}
            placeholder={t("emailTemplates.resetSubjectPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="resetBody">{t("emailTemplates.body")}</Label>
          <Textarea
            id="resetBody"
            value={resetBody}
            onChange={(e) => setResetBody(e.target.value)}
            placeholder={t("emailTemplates.resetBodyPlaceholder")}
            rows={8}
            className="font-mono text-sm"
          />
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}
