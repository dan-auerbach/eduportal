"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UserCheck,
  UserX,
  Users,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Zap,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { t } from "@/lib/i18n";
import {
  getEventAttendees,
  confirmAttendance,
  bulkConfirmAttendance,
  revokeAttendance,
} from "@/actions/attendance";
import type { AttendanceDTO, AttendanceSummary } from "@/actions/attendance";

type AttendeeManagerProps = {
  eventId: string;
  attendeeCount: number;
  isPast: boolean;
};

const statusBadge: Record<
  string,
  { label: () => string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  REGISTERED: { label: () => t("mentorLive.statusRegistered"), variant: "secondary" },
  CANCELLED: { label: () => t("mentorLive.statusCancelled"), variant: "outline" },
  ATTENDED: { label: () => t("mentorLive.statusAttended"), variant: "default" },
  NO_SHOW: { label: () => t("mentorLive.statusNoShow"), variant: "destructive" },
};

export function AttendeeManager({
  eventId,
  attendeeCount,
  isPast,
}: AttendeeManagerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [attendees, setAttendees] = useState<AttendanceDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  // Load attendees when opened
  useEffect(() => {
    if (isOpen && !hasLoaded) {
      setIsLoading(true);
      getEventAttendees(eventId).then((result) => {
        if (result.success) {
          setAttendees(result.data);
        } else {
          toast.error(result.error);
        }
        setIsLoading(false);
        setHasLoaded(true);
      });
    }
  }, [isOpen, hasLoaded, eventId]);

  function refreshAttendees() {
    setIsLoading(true);
    getEventAttendees(eventId).then((result) => {
      if (result.success) {
        setAttendees(result.data);
      }
      setIsLoading(false);
    });
  }

  function handleConfirm(userId: string) {
    startTransition(async () => {
      const result = await confirmAttendance(eventId, userId);
      if (result.success) {
        toast.success(t("mentorLive.attendanceConfirmed"));
        refreshAttendees();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRevoke(userId: string) {
    startTransition(async () => {
      const result = await revokeAttendance(eventId, userId);
      if (result.success) {
        toast.success(t("mentorLive.attendanceRevoked"));
        refreshAttendees();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleBulkConfirm() {
    if (selectedIds.size === 0) return;
    startTransition(async () => {
      const result = await bulkConfirmAttendance(eventId, Array.from(selectedIds));
      if (result.success) {
        toast.success(
          `${t("mentorLive.attendanceConfirmed")} (${result.data.confirmed})`
        );
        setSelectedIds(new Set());
        refreshAttendees();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleSelect(userId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function selectAllRegistered() {
    const registered = attendees
      .filter((a) => a.status === "REGISTERED")
      .map((a) => a.userId);
    setSelectedIds(new Set(registered));
  }

  // Compute summary from loaded attendees
  const summary: AttendanceSummary = {
    registered: attendees.filter((a) => a.status === "REGISTERED").length,
    cancelled: attendees.filter((a) => a.status === "CANCELLED").length,
    attended: attendees.filter((a) => a.status === "ATTENDED").length,
    noShow: attendees.filter((a) => a.status === "NO_SHOW").length,
    total: attendees.length,
  };

  // Filter: show active attendees (not cancelled)
  const activeAttendees = attendees.filter((a) => a.status !== "CANCELLED");
  const cancelledAttendees = attendees.filter((a) => a.status === "CANCELLED");

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <Users className="h-3.5 w-3.5" />
          {t("mentorLive.attendees")} ({attendeeCount})
          {isOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border bg-card p-4 space-y-4">
          {isLoading && !hasLoaded ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t("common.loading")}
            </div>
          ) : attendees.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              {t("mentorLive.noAttendees")}
            </p>
          ) : (
            <>
              {/* Summary badges */}
              <div className="flex flex-wrap gap-2">
                {summary.registered > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <UserCheck className="h-3 w-3" />
                    {summary.registered} {t("mentorLive.statusRegistered").toLowerCase()}
                  </Badge>
                )}
                {summary.attended > 0 && (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {summary.attended} {t("mentorLive.statusAttended").toLowerCase()}
                  </Badge>
                )}
                {summary.noShow > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {summary.noShow} {t("mentorLive.statusNoShow").toLowerCase()}
                  </Badge>
                )}
              </div>

              {/* Bulk actions for past events */}
              {isPast && activeAttendees.some((a) => a.status === "REGISTERED") && (
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAllRegistered}
                    className="text-xs h-7"
                  >
                    {t("common.all")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBulkConfirm}
                    disabled={isPending || selectedIds.size === 0}
                    className="gap-1.5 text-xs h-7"
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {t("mentorLive.bulkConfirm")} {selectedIds.size > 0 && `(${selectedIds.size})`}
                  </Button>
                </div>
              )}

              {/* Active attendees list */}
              <div className="space-y-1">
                {activeAttendees.map((attendee) => {
                  const badge = statusBadge[attendee.status];
                  const canConfirm = attendee.status === "REGISTERED";
                  const canRevoke = attendee.status === "ATTENDED";

                  return (
                    <div
                      key={attendee.id}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50 transition-colors"
                    >
                      {/* Checkbox for bulk select (only for registered in past events) */}
                      {isPast && canConfirm && (
                        <Checkbox
                          checked={selectedIds.has(attendee.userId)}
                          onCheckedChange={() => toggleSelect(attendee.userId)}
                          className="shrink-0"
                        />
                      )}

                      {/* User info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {attendee.userName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {attendee.userEmail}
                        </p>
                      </div>

                      {/* Status badge */}
                      <Badge variant={badge.variant} className="shrink-0 text-xs">
                        {badge.label()}
                      </Badge>

                      {/* XP indicator */}
                      {attendee.xpAwarded && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-xs gap-1 text-yellow-600 border-yellow-300 bg-yellow-50"
                        >
                          <Zap className="h-3 w-3" />
                          XP
                        </Badge>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-1 shrink-0">
                        {canConfirm && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleConfirm(attendee.userId)}
                            disabled={isPending}
                            className="h-7 w-7 p-0"
                            title={t("mentorLive.confirmAttendance")}
                          >
                            {isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                            )}
                          </Button>
                        )}
                        {canRevoke && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(attendee.userId)}
                            disabled={isPending}
                            className="h-7 w-7 p-0"
                            title={t("mentorLive.revokeAttendance")}
                          >
                            {isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Cancelled attendees (collapsed) */}
              {cancelledAttendees.length > 0 && (
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground transition-colors">
                    {summary.cancelled} {t("mentorLive.statusCancelled").toLowerCase()}
                  </summary>
                  <div className="mt-2 space-y-1 pl-2">
                    {cancelledAttendees.map((attendee) => (
                      <div key={attendee.id} className="flex items-center gap-2 py-0.5">
                        <span className="truncate">{attendee.userName}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {t("mentorLive.statusCancelled")}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
