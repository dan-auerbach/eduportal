"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Video } from "lucide-react";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createLiveEvent, updateLiveEvent } from "@/actions/live-events";
import type { LiveEventDTO } from "@/actions/live-events";

// ── Platform detection + icons ───────────────────────────────────────────────

type MeetPlatform = "meet" | "teams" | "other";

function detectPlatform(url: string): MeetPlatform {
  if (/meet\.google\.com/i.test(url)) return "meet";
  if (/teams\.microsoft\.com|teams\.live\.com/i.test(url)) return "teams";
  return "other";
}

function GoogleMeetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 11L18.5 7.5V16.5L14.5 13V15C14.5 15.55 14.05 16 13.5 16H6.5C5.95 16 5.5 15.55 5.5 15V9C5.5 8.45 5.95 8 6.5 8H13.5C14.05 8 14.5 8.45 14.5 9V11Z" fill="currentColor"/>
    </svg>
  );
}

function TeamsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.5 7.5H17V5.5C17 4.95 16.55 4.5 16 4.5H12C11.45 4.5 11 4.95 11 5.5V7.5H8.5C7.67 7.5 7 8.17 7 9V15C7 15.83 7.67 16.5 8.5 16.5H11V18.5C11 19.05 11.45 19.5 12 19.5H16C16.55 19.5 17 19.05 17 18.5V16.5H19.5C20.33 16.5 21 15.83 21 15V9C21 8.17 20.33 7.5 19.5 7.5ZM14 6.5C14.55 6.5 15 6.95 15 7.5H13C13 6.95 13.45 6.5 14 6.5ZM19 14.5H17V9.5H19V14.5Z" fill="currentColor"/>
    </svg>
  );
}

export { GoogleMeetIcon, TeamsIcon, detectPlatform };
export type { MeetPlatform };

// ── Platform Quick-Select ────────────────────────────────────────────────────

function PlatformQuickSelect({
  currentUrl,
  onSelect,
}: {
  currentUrl: string;
  onSelect: (platform: MeetPlatform) => void;
}) {
  const active = detectPlatform(currentUrl);

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onSelect("meet")}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
          active === "meet"
            ? "border-primary bg-primary/10 text-primary"
            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <GoogleMeetIcon className="h-3.5 w-3.5" />
        Google Meet
      </button>
      <button
        type="button"
        onClick={() => onSelect("teams")}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
          active === "teams"
            ? "border-primary bg-primary/10 text-primary"
            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <TeamsIcon className="h-3.5 w-3.5" />
        MS Teams
      </button>
      <button
        type="button"
        onClick={() => onSelect("other")}
        className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
          active === "other" && currentUrl.length > 0
            ? "border-primary bg-primary/10 text-primary"
            : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        <Video className="h-3.5 w-3.5" />
        {t("mentorLive.otherPlatform")}
      </button>
    </div>
  );
}

const PLATFORM_PLACEHOLDERS: Record<MeetPlatform, string> = {
  meet: "https://meet.google.com/xxx-xxxx-xxx",
  teams: "https://teams.microsoft.com/l/meetup-join/...",
  other: "https://...",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDatetimeString(isoString: string): string {
  const d = new Date(isoString);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

// ── Types ────────────────────────────────────────────────────────────────────

type ModuleOption = { id: string; title: string };
type GroupOption = { id: string; name: string };

// ── Group Checkboxes ─────────────────────────────────────────────────────────

function GroupCheckboxes({
  groups,
  selected,
  onChange,
  idPrefix,
}: {
  groups: GroupOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  idPrefix: string;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label>{t("mentorLive.groupsField")}</Label>
      <p className="text-xs text-muted-foreground">{t("mentorLive.groupsHint")}</p>
      <div className="grid gap-2 max-h-40 overflow-y-auto rounded-md border p-3">
        {groups.map((g) => (
          <label
            key={g.id}
            htmlFor={`${idPrefix}-group-${g.id}`}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Checkbox
              id={`${idPrefix}-group-${g.id}`}
              checked={selected.has(g.id)}
              onCheckedChange={(checked) => {
                const next = new Set(selected);
                if (checked) next.add(g.id);
                else next.delete(g.id);
                onChange(next);
              }}
            />
            <span className="text-sm">{g.name}</span>
          </label>
        ))}
      </div>
      {selected.size === 0 && (
        <p className="text-xs text-muted-foreground">{t("mentorLive.allUsers")}</p>
      )}
    </div>
  );
}

// ── Create Dialog ────────────────────────────────────────────────────────────

export function CreateLiveEventDialog({
  modules,
  groups,
}: {
  modules: ModuleOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [meetUrl, setMeetUrl] = useState("");
  const [activePlatform, setActivePlatform] = useState<MeetPlatform>("meet");

  function handlePlatformSelect(platform: MeetPlatform) {
    setActivePlatform(platform);
    // If URL is empty or matches a different platform prefix, set a new prefix
    const current = meetUrl.trim();
    if (!current || detectPlatform(current) !== platform) {
      if (platform === "meet") setMeetUrl("https://meet.google.com/");
      else if (platform === "teams") setMeetUrl("https://teams.microsoft.com/l/meetup-join/");
      else setMeetUrl("");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const localDatetime = formData.get("startsAt") as string;
    const startsAtISO = localDatetime ? new Date(localDatetime).toISOString() : "";

    const data = {
      title: (formData.get("title") as string) || "",
      startsAt: startsAtISO,
      meetUrl: meetUrl || "",
      instructions: (formData.get("instructions") as string) || undefined,
      relatedModuleId: (formData.get("relatedModuleId") as string) || null,
      groupIds: [...selectedGroups],
    };

    startTransition(async () => {
      const result = await createLiveEvent(data);
      if (result.success) {
        toast.success(t("mentorLive.eventCreated"));
        setOpen(false);
        setSelectedGroups(new Set());
        setMeetUrl("");
        setActivePlatform("meet");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("mentorLive.addEvent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("mentorLive.addEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("mentorLive.titleField")}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startsAt">{t("mentorLive.dateField")}</Label>
            <Input id="startsAt" name="startsAt" type="datetime-local" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meetUrl">{t("mentorLive.meetUrlField")}</Label>
            <PlatformQuickSelect currentUrl={meetUrl} onSelect={handlePlatformSelect} />
            <Input
              id="meetUrl"
              name="meetUrl"
              type="url"
              required
              value={meetUrl}
              onChange={(e) => {
                setMeetUrl(e.target.value);
                setActivePlatform(detectPlatform(e.target.value));
              }}
              placeholder={PLATFORM_PLACEHOLDERS[activePlatform]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instructions">{t("mentorLive.instructionsField")}</Label>
            <Textarea id="instructions" name="instructions" rows={3} maxLength={2000} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="relatedModuleId">{t("mentorLive.relatedModuleField")}</Label>
            <select
              id="relatedModuleId"
              name="relatedModuleId"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue=""
            >
              <option value="">{t("mentorLive.noModule")}</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <GroupCheckboxes
            groups={groups}
            selected={selectedGroups}
            onChange={setSelectedGroups}
            idPrefix="create"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.creating") : t("mentorLive.addEvent")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ──────────────────────────────────────────────────────────────

export function EditLiveEventDialog({
  event,
  modules,
  groups,
}: {
  event: LiveEventDTO;
  modules: ModuleOption[];
  groups: GroupOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(
    new Set(event.groups.map((g) => g.id))
  );
  const [meetUrl, setMeetUrl] = useState(event.meetUrl);
  const [activePlatform, setActivePlatform] = useState<MeetPlatform>(detectPlatform(event.meetUrl));

  // Sync selectedGroups when event.groups changes (e.g. after router.refresh())
  const eventGroupIds = event.groups.map((g) => g.id).sort().join(",");
  const [prevGroupIds, setPrevGroupIds] = useState(eventGroupIds);
  if (eventGroupIds !== prevGroupIds) {
    setPrevGroupIds(eventGroupIds);
    setSelectedGroups(new Set(event.groups.map((g) => g.id)));
  }

  // Sync meetUrl when event.meetUrl changes
  const [prevMeetUrl, setPrevMeetUrl] = useState(event.meetUrl);
  if (event.meetUrl !== prevMeetUrl) {
    setPrevMeetUrl(event.meetUrl);
    setMeetUrl(event.meetUrl);
    setActivePlatform(detectPlatform(event.meetUrl));
  }

  function handlePlatformSelect(platform: MeetPlatform) {
    setActivePlatform(platform);
    const current = meetUrl.trim();
    if (!current || detectPlatform(current) !== platform) {
      if (platform === "meet") setMeetUrl("https://meet.google.com/");
      else if (platform === "teams") setMeetUrl("https://teams.microsoft.com/l/meetup-join/");
      else setMeetUrl("");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const localDatetime = formData.get("startsAt") as string;
    const startsAtISO = localDatetime ? new Date(localDatetime).toISOString() : undefined;

    const data = {
      title: (formData.get("title") as string) || undefined,
      startsAt: startsAtISO,
      meetUrl: meetUrl || undefined,
      instructions: (formData.get("instructions") as string) || null,
      relatedModuleId: (formData.get("relatedModuleId") as string) || null,
      groupIds: [...selectedGroups],
    };

    startTransition(async () => {
      const result = await updateLiveEvent(event.id, data);
      if (result.success) {
        toast.success(t("mentorLive.eventUpdated"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" />
          {t("mentorLive.editEvent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("mentorLive.editEvent")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">{t("mentorLive.titleField")}</Label>
            <Input
              id="edit-title"
              name="title"
              required
              maxLength={200}
              defaultValue={event.title}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-startsAt">{t("mentorLive.dateField")}</Label>
            <Input
              id="edit-startsAt"
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={toLocalDatetimeString(event.startsAt)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-meetUrl">{t("mentorLive.meetUrlField")}</Label>
            <PlatformQuickSelect currentUrl={meetUrl} onSelect={handlePlatformSelect} />
            <Input
              id="edit-meetUrl"
              name="meetUrl"
              type="url"
              required
              value={meetUrl}
              onChange={(e) => {
                setMeetUrl(e.target.value);
                setActivePlatform(detectPlatform(e.target.value));
              }}
              placeholder={PLATFORM_PLACEHOLDERS[activePlatform]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-instructions">{t("mentorLive.instructionsField")}</Label>
            <Textarea
              id="edit-instructions"
              name="instructions"
              rows={3}
              maxLength={2000}
              defaultValue={event.instructions ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-relatedModuleId">{t("mentorLive.relatedModuleField")}</Label>
            <select
              id="edit-relatedModuleId"
              name="relatedModuleId"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              defaultValue={event.relatedModule?.id ?? ""}
            >
              <option value="">{t("mentorLive.noModule")}</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
          <GroupCheckboxes
            groups={groups}
            selected={selectedGroups}
            onChange={setSelectedGroups}
            idPrefix="edit"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
