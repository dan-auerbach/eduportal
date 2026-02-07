"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sendDeadlineReminder } from "@/actions/notifications";
import { t } from "@/lib/i18n";

interface LateUserActionsProps {
  userId: string;
  moduleId: string;
  moduleTitle: string;
}

export function LateUserActions({
  userId,
  moduleId,
  moduleTitle,
}: LateUserActionsProps) {
  const [sending, setSending] = useState(false);

  async function handleSendReminder() {
    setSending(true);
    const result = await sendDeadlineReminder(userId, moduleId, moduleTitle);
    if (result.success) {
      toast.success(t("admin.lateUsers.reminderSent"));
    } else {
      toast.error(result.error);
    }
    setSending(false);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={handleSendReminder}
        disabled={sending}
        title={t("admin.lateUsers.sendReminder")}
      >
        <Bell className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        asChild
        title={t("admin.lateUsers.overrideProgress")}
      >
        <Link href={`/admin/progress/${userId}`}>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
