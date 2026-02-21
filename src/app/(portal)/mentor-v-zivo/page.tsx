import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { getLiveEventsOverview, getPublishedModulesForSelect, getGroupsForSelect } from "@/actions/live-events";
import type { LiveEventDTO } from "@/actions/live-events";
import { getMyAttendanceBatch } from "@/actions/attendance";
import type { MyAttendanceMap } from "@/actions/attendance";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Radio,
  ExternalLink,
  BookOpen,
  Calendar,
  CalendarPlus,
  Info,
  Users,
  MapPin,
  Globe,
  Monitor,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateLiveEventDialog, EditLiveEventDialog, GoogleMeetIcon, TeamsIcon } from "@/components/live-events/live-event-form";
import { detectPlatform } from "@/lib/meet-platform";
import { DeleteLiveEventButton } from "@/components/live-events/live-event-actions";
import { AttendanceButton } from "@/components/live-events/attendance-button";
import { AttendeeManager } from "@/components/live-events/attendee-manager";

function MeetPlatformIcon({ url, className }: { url: string; className?: string }) {
  const platform = detectPlatform(url);
  if (platform === "meet") return <GoogleMeetIcon className={className} />;
  if (platform === "teams") return <TeamsIcon className={className} />;
  return <ExternalLink className={className} />;
}

function meetPlatformLabel(url: string): string {
  const platform = detectPlatform(url);
  if (platform === "meet") return "Google Meet";
  if (platform === "teams") return "MS Teams";
  return t("mentorLive.join");
}

/** Resolve the effective online URL: prefer onlineUrl, fall back to meetUrl */
function getEffectiveUrl(event: LiveEventDTO): string | null {
  return event.onlineUrl ?? event.meetUrl ?? null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDateTime(isoString: string, locale: string, tz: string): string {
  const loc = locale === "sl" ? "sl-SI" : "en-GB";
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString(loc, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
  const timePart = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${datePart} ob ${timePart}`;
}

function formatEventDateShort(isoString: string, locale: string, tz: string): string {
  const loc = locale === "sl" ? "sl-SI" : "en-GB";
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  });
  const timePart = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${datePart}, ${timePart}`;
}

// ── Location type display ────────────────────────────────────────────────────

function LocationTypeBadge({ event }: { event: LiveEventDTO }) {
  const type = event.locationType;
  if (type === "ONLINE") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Monitor className="h-3 w-3" />
        {t("mentorLive.locationOnline")}
      </Badge>
    );
  }
  if (type === "PHYSICAL") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <MapPin className="h-3 w-3" />
        {t("mentorLive.locationPhysical")}
      </Badge>
    );
  }
  // HYBRID
  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <Globe className="h-3 w-3" />
      {t("mentorLive.locationHybrid")}
    </Badge>
  );
}

function EventLocationInfo({ event, compact }: { event: LiveEventDTO; compact?: boolean }) {
  const effectiveUrl = getEffectiveUrl(event);
  const showUrl = event.locationType !== "PHYSICAL" && effectiveUrl;
  const showPhysical = event.locationType !== "ONLINE" && event.physicalLocation;

  if (!showUrl && !showPhysical) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {showPhysical && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {event.physicalLocation}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {showPhysical && (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{event.physicalLocation}</span>
        </div>
      )}
    </div>
  );
}

// ── Group badges ─────────────────────────────────────────────────────────────

function EventGroupBadges({ event }: { event: LiveEventDTO }) {
  if (event.groups.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {event.groups.map((g) => (
        <Badge
          key={g.id}
          variant="outline"
          className="text-xs"
          style={g.color ? { borderColor: g.color, color: g.color } : undefined}
        >
          {g.name}
        </Badge>
      ))}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function EventHighlight({
  event,
  isAdmin,
  modules,
  groups,
  locale,
  myAttendance,
  tz,
}: {
  event: LiveEventDTO;
  isAdmin: boolean;
  modules: { id: string; title: string }[];
  groups: { id: string; name: string }[];
  locale: string;
  myAttendance: MyAttendanceMap;
  tz: string;
}) {
  const effectiveUrl = getEffectiveUrl(event);
  const attendance = myAttendance[event.id];

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-primary mb-1">
              {t("mentorLive.nextEvent")}
            </p>
            <CardTitle className="text-xl">{event.title}</CardTitle>
            <div className="flex items-center gap-2 pt-1">
              <LocationTypeBadge event={event} />
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-1 shrink-0">
              <EditLiveEventDialog event={event} modules={modules} groups={groups} />
              <DeleteLiveEventButton eventId={event.id} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {formatEventDateTime(event.startsAt, locale, tz)}
          </span>
        </div>

        <EventLocationInfo event={event} />
        <EventGroupBadges event={event} />

        {event.instructions && (
          <div className="flex gap-2 text-sm">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-muted-foreground whitespace-pre-line">{event.instructions}</p>
          </div>
        )}

        {event.relatedModule && (
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <Link
              href={`/modules/${event.relatedModule.id}`}
              className="text-primary hover:underline"
            >
              {t("mentorLive.relatedModule")}: {event.relatedModule.title}
            </Link>
          </div>
        )}

        {/* Attendance: register/cancel for employees */}
        <div className="flex items-center gap-3 pt-1">
          <AttendanceButton
            eventId={event.id}
            initialStatus={attendance?.status ?? null}
            isPast={false}
            xpAwarded={attendance?.xpAwarded}
          />
          {event.attendeeCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {event.attendeeCount} {t("mentorLive.registered").toLowerCase()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          {effectiveUrl && event.locationType !== "PHYSICAL" && (
            <a
              href={effectiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              <Button size="lg">
                <MeetPlatformIcon url={effectiveUrl} className="mr-2 h-4 w-4" />
                {meetPlatformLabel(effectiveUrl)}
              </Button>
            </a>
          )}
          <a href={`/api/calendar/live-event/${event.id}`}>
            <Button variant="outline" size="lg">
              <CalendarPlus className="mr-2 h-4 w-4" />
              {t("mentorLive.addToCalendar")}
            </Button>
          </a>
        </div>

        {/* Admin: attendee management */}
        {isAdmin && (
          <AttendeeManager
            eventId={event.id}
            attendeeCount={event.attendeeCount}
            isPast={false}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EventListItem({
  event,
  showJoin,
  isAdmin,
  modules,
  groups,
  locale,
  isPast,
  myAttendance,
  tz,
}: {
  event: LiveEventDTO;
  showJoin: boolean;
  isAdmin: boolean;
  modules: { id: string; title: string }[];
  groups: { id: string; name: string }[];
  locale: string;
  isPast: boolean;
  myAttendance: MyAttendanceMap;
  tz: string;
}) {
  const effectiveUrl = getEffectiveUrl(event);
  const attendance = myAttendance[event.id];

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Top row: title + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{event.title}</h3>
            <LocationTypeBadge event={event} />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatEventDateShort(event.startsAt, locale, tz)}
          </p>
          <EventLocationInfo event={event} compact />
          <EventGroupBadges event={event} />
          {event.relatedModule && (
            <Link
              href={`/modules/${event.relatedModule.id}`}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <BookOpen className="h-3 w-3" />
              {event.relatedModule.title}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showJoin && (
            <>
              <a href={`/api/calendar/live-event/${event.id}`}>
                <Button variant="ghost" size="sm" className="gap-1.5" title={t("mentorLive.addToCalendar")}>
                  <CalendarPlus className="h-3.5 w-3.5" />
                </Button>
              </a>
              {effectiveUrl && event.locationType !== "PHYSICAL" && (
                <a href={effectiveUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <MeetPlatformIcon url={effectiveUrl} className="h-3.5 w-3.5" />
                    {meetPlatformLabel(effectiveUrl)}
                  </Button>
                </a>
              )}
            </>
          )}
          {isAdmin && (
            <>
              <EditLiveEventDialog event={event} modules={modules} groups={groups} />
              <DeleteLiveEventButton eventId={event.id} />
            </>
          )}
        </div>
      </div>

      {/* Attendance row */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t">
        <AttendanceButton
          eventId={event.id}
          initialStatus={attendance?.status ?? null}
          isPast={isPast}
          xpAwarded={attendance?.xpAwarded}
        />
        {event.attendeeCount > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" />
            {event.attendeeCount}
          </span>
        )}
      </div>

      {/* Admin: attendee management */}
      {isAdmin && (
        <AttendeeManager
          eventId={event.id}
          attendeeCount={event.attendeeCount}
          isPast={isPast}
        />
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MentorLivePage() {
  const ctx = await getTenantContext();
  if (!ctx.config.features.liveEvents) redirect("/dashboard");
  setLocale(ctx.tenantLocale);

  const role = ctx.effectiveRole;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";

  const overviewResult = await getLiveEventsOverview();
  if (!overviewResult.success) {
    redirect("/dashboard");
  }

  const { nextEvent, upcoming, past } = overviewResult.data;

  // Collect all event IDs and batch-fetch current user's attendance
  const allEvents = [
    ...(nextEvent ? [nextEvent] : []),
    ...upcoming,
    ...past,
  ];
  const allEventIds = allEvents.map((e) => e.id);

  let myAttendance: MyAttendanceMap = {};
  if (allEventIds.length > 0) {
    const attendanceResult = await getMyAttendanceBatch(allEventIds);
    if (attendanceResult.success) {
      myAttendance = attendanceResult.data;
    }
  }

  // Fetch modules and groups for admin form dropdowns
  let modules: { id: string; title: string }[] = [];
  let groups: { id: string; name: string }[] = [];
  if (isAdmin) {
    const [modulesResult, groupsResult] = await Promise.all([
      getPublishedModulesForSelect(),
      getGroupsForSelect(),
    ]);
    if (modulesResult.success) modules = modulesResult.data;
    if (groupsResult.success) groups = groupsResult.data;
  }

  const locale = ctx.tenantLocale;
  const hasNoEvents = !nextEvent && upcoming.length === 0 && past.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("mentorLive.title")}</h1>
        </div>
        {isAdmin && <CreateLiveEventDialog modules={modules} groups={groups} />}
      </div>

      {/* Empty state */}
      {hasNoEvents && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Radio className="h-10 w-10 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">{t("mentorLive.noEvents")}</p>
            <p className="text-sm text-muted-foreground mt-1">{t("mentorLive.noEventsDesc")}</p>
            {isAdmin && (
              <div className="mt-4">
                <CreateLiveEventDialog modules={modules} groups={groups} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Highlight: next event */}
      {nextEvent && (
        <EventHighlight
          event={nextEvent}
          isAdmin={isAdmin}
          modules={modules}
          groups={groups}
          locale={locale}
          myAttendance={myAttendance}
          tz={ctx.config.timezone}
        />
      )}

      {/* Upcoming events */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("mentorLive.upcoming")}</h2>
          <div className="space-y-2">
            {upcoming.map((event) => (
              <EventListItem
                key={event.id}
                event={event}
                showJoin={true}
                isAdmin={isAdmin}
                modules={modules}
                groups={groups}
                locale={locale}
                isPast={false}
                myAttendance={myAttendance}
                tz={ctx.config.timezone}
              />
            ))}
          </div>
        </section>
      )}

      {/* Past events */}
      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">{t("mentorLive.past")}</h2>
          <div className="space-y-2">
            {past.map((event) => (
              <EventListItem
                key={event.id}
                event={event}
                showJoin={false}
                isAdmin={isAdmin}
                modules={modules}
                groups={groups}
                locale={locale}
                isPast={true}
                myAttendance={myAttendance}
                tz={ctx.config.timezone}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
