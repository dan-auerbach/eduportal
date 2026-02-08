import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { getLiveEventsOverview, getPublishedModulesForSelect } from "@/actions/live-events";
import type { LiveEventDTO } from "@/actions/live-events";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio, ExternalLink, BookOpen, Calendar, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateLiveEventDialog, EditLiveEventDialog } from "@/components/live-events/live-event-form";
import { DeleteLiveEventButton } from "@/components/live-events/live-event-actions";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatEventDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatEventTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function isFuture(isoString: string): boolean {
  return new Date(isoString) >= new Date();
}

// ── Sub-components ───────────────────────────────────────────────────────────

function EventHighlight({
  event,
  isAdmin,
  modules,
}: {
  event: LiveEventDTO;
  isAdmin: boolean;
  modules: { id: string; title: string }[];
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
              <EditLiveEventDialog event={event} modules={modules} />
              <DeleteLiveEventButton eventId={event.id} />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">
            {formatEventDate(event.startsAt)} {t("common.at") || "ob"} {formatEventTime(event.startsAt)}
          </span>
        </div>

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

        <div className="pt-2">
          <a
            href={event.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2"
          >
            <Button size="lg">
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("mentorLive.join")}
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
}: {
  event: LiveEventDTO;
  showJoin: boolean;
  isAdmin: boolean;
  modules: { id: string; title: string }[];
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="font-medium truncate">{event.title}</h3>
        <p className="text-sm text-muted-foreground">
          {formatEventDate(event.startsAt)}, {formatEventTime(event.startsAt)}
        </p>
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
        {showJoin && event.meetUrl && (
          <a href={event.meetUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              {t("mentorLive.join")}
            </Button>
          </a>
        )}
        {isAdmin && (
          <>
            <EditLiveEventDialog event={event} modules={modules} />
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

  // Fetch modules for admin select dropdown
  let modules: { id: string; title: string }[] = [];
  if (isAdmin) {
    const modulesResult = await getPublishedModulesForSelect();
    if (modulesResult.success) {
      modules = modulesResult.data;
    }
  }

  const hasNoEvents = !nextEvent && upcoming.length === 0 && past.length === 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radio className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t("mentorLive.title")}</h1>
        </div>
        {isAdmin && <CreateLiveEventDialog modules={modules} />}
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
                <CreateLiveEventDialog modules={modules} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Highlight: next event */}
      {nextEvent && (
        <EventHighlight event={nextEvent} isAdmin={isAdmin} modules={modules} />
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
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
