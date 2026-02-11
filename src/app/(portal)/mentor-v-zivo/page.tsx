import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { getLiveEventsOverview, getPublishedModulesForSelect, getGroupsForSelect } from "@/actions/live-events";
import type { LiveEventDTO } from "@/actions/live-events";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio, ExternalLink, BookOpen, Calendar, CalendarPlus, Info, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateLiveEventDialog, EditLiveEventDialog, GoogleMeetIcon, TeamsIcon, detectPlatform } from "@/components/live-events/live-event-form";
import { DeleteLiveEventButton } from "@/components/live-events/live-event-actions";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDateTime(isoString: string, locale: string): string {
  const loc = locale === "sl" ? "sl-SI" : "en-GB";
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString(loc, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ob ${timePart}`;
}

function formatEventDateShort(isoString: string, locale: string): string {
  const loc = locale === "sl" ? "sl-SI" : "en-GB";
  const d = new Date(isoString);
  const datePart = d.toLocaleDateString(loc, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
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
}: {
  event: LiveEventDTO;
  isAdmin: boolean;
  modules: { id: string; title: string }[];
  groups: { id: string; name: string }[];
  locale: string;
}) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary mb-1">
              {t("mentorLive.nextEvent")}
            </p>
            <CardTitle className="text-xl">{event.title}</CardTitle>
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
            {formatEventDateTime(event.startsAt, locale)}
          </span>
        </div>

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

        <div className="flex items-center gap-3 pt-2">
          <a
            href={event.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2"
          >
            <Button size="lg">
              <MeetPlatformIcon url={event.meetUrl} className="mr-2 h-4 w-4" />
              {meetPlatformLabel(event.meetUrl)}
            </Button>
          </a>
          <a href={`/api/calendar/live-event/${event.id}`}>
            <Button variant="outline" size="lg">
              <CalendarPlus className="mr-2 h-4 w-4" />
              {t("mentorLive.addToCalendar")}
            </Button>
          </a>
        </div>
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
}: {
  event: LiveEventDTO;
  showJoin: boolean;
  isAdmin: boolean;
  modules: { id: string; title: string }[];
  groups: { id: string; name: string }[];
  locale: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="font-medium truncate">{event.title}</h3>
        <p className="text-sm text-muted-foreground">
          {formatEventDateShort(event.startsAt, locale)}
        </p>
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
            {event.meetUrl && (
              <a href={event.meetUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <MeetPlatformIcon url={event.meetUrl} className="h-3.5 w-3.5" />
                  {meetPlatformLabel(event.meetUrl)}
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
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MentorLivePage() {
  const ctx = await getTenantContext();
  setLocale(ctx.tenantLocale);

  const role = ctx.effectiveRole;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";

  const overviewResult = await getLiveEventsOverview();
  if (!overviewResult.success) {
    redirect("/dashboard");
  }

  const { nextEvent, upcoming, past } = overviewResult.data;

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
        <EventHighlight event={nextEvent} isAdmin={isAdmin} modules={modules} groups={groups} locale={locale} />
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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
