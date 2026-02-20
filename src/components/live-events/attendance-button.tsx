"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserCheck, UserX, Loader2, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import { registerForEvent, cancelRegistration } from "@/actions/attendance";
import type { AttendanceStatus } from "@/generated/prisma/client";

type AttendanceButtonProps = {
  eventId: string;
  initialStatus: AttendanceStatus | null;
  isPast: boolean;
  xpAwarded?: boolean;
};

const statusConfig: Record<
  AttendanceStatus,
  { label: () => string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }
> = {
  REGISTERED: {
    label: () => t("mentorLive.registered"),
    variant: "secondary",
    icon: <Check className="h-3.5 w-3.5" />,
  },
  CANCELLED: {
    label: () => t("mentorLive.statusCancelled"),
    variant: "outline",
    icon: <UserX className="h-3.5 w-3.5" />,
  },
  ATTENDED: {
    label: () => t("mentorLive.statusAttended"),
    variant: "default",
    icon: <UserCheck className="h-3.5 w-3.5" />,
  },
  NO_SHOW: {
    label: () => t("mentorLive.statusNoShow"),
    variant: "destructive",
    icon: <UserX className="h-3.5 w-3.5" />,
  },
};

export function AttendanceButton({
  eventId,
  initialStatus,
  isPast,
  xpAwarded,
}: AttendanceButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<AttendanceStatus | null>(initialStatus);
  const [isPending, startTransition] = useTransition();

  function handleRegister() {
    startTransition(async () => {
      const result = await registerForEvent(eventId);
      if (result.success) {
        setStatus(result.data.status);
        toast.success(t("mentorLive.registered"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelRegistration(eventId);
      if (result.success) {
        setStatus(result.data.status);
        toast.success(t("mentorLive.cancelRegistration"));
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  // Past event: show status badge only
  if (isPast) {
    if (!status) return null;
    const config = statusConfig[status];
    return (
      <div className="flex items-center gap-2">
        <Badge variant={config.variant} className="gap-1">
          {config.icon}
          {config.label()}
        </Badge>
        {xpAwarded && (
          <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300 bg-yellow-50">
            <Zap className="h-3 w-3" />
            {t("mentorLive.xpAwardedForAttendance")}
          </Badge>
        )}
      </div>
    );
  }

  // Future event: ATTENDED or NO_SHOW are set by admin, show badge
  if (status === "ATTENDED" || status === "NO_SHOW") {
    const config = statusConfig[status];
    return (
      <div className="flex items-center gap-2">
        <Badge variant={config.variant} className="gap-1">
          {config.icon}
          {config.label()}
        </Badge>
        {xpAwarded && (
          <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-300 bg-yellow-50">
            <Zap className="h-3 w-3" />
            {t("mentorLive.xpAwardedForAttendance")}
          </Badge>
        )}
      </div>
    );
  }

  // Not registered or cancelled: show register button
  if (!status || status === "CANCELLED") {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={handleRegister}
        disabled={isPending}
        className="gap-1.5"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <UserCheck className="h-3.5 w-3.5" />
        )}
        {t("mentorLive.register")}
      </Button>
    );
  }

  // REGISTERED: show registered badge + cancel button
  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="gap-1">
        <Check className="h-3.5 w-3.5" />
        {t("mentorLive.registered")}
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        onClick={handleCancel}
        disabled={isPending}
        className="gap-1.5 text-destructive hover:text-destructive h-7 px-2 text-xs"
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <UserX className="h-3 w-3" />
        )}
        {t("mentorLive.cancelRegistration")}
      </Button>
    </div>
  );
}
