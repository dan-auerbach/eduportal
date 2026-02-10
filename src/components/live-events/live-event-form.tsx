"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const localDatetime = formData.get("startsAt") as string;
    const startsAtISO = localDatetime ? new Date(localDatetime).toISOString() : "";

    const data = {
      title: (formData.get("title") as string) || "",
      startsAt: startsAtISO,
      meetUrl: (formData.get("meetUrl") as string) || "",
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
            <Input
              id="meetUrl"
              name="meetUrl"
              type="url"
              required
              placeholder={t("mentorLive.meetUrlPlaceholder")}
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

  // Sync selectedGroups when event.groups changes (e.g. after router.refresh())
  const eventGroupIds = event.groups.map((g) => g.id).sort().join(",");
  const [prevGroupIds, setPrevGroupIds] = useState(eventGroupIds);
  if (eventGroupIds !== prevGroupIds) {
    setPrevGroupIds(eventGroupIds);
    setSelectedGroups(new Set(event.groups.map((g) => g.id)));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const localDatetime = formData.get("startsAt") as string;
    const startsAtISO = localDatetime ? new Date(localDatetime).toISOString() : undefined;

    const data = {
      title: (formData.get("title") as string) || undefined,
      startsAt: startsAtISO,
      meetUrl: (formData.get("meetUrl") as string) || undefined,
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
            <Input
              id="edit-meetUrl"
              name="meetUrl"
              type="url"
              required
              defaultValue={event.meetUrl}
              placeholder={t("mentorLive.meetUrlPlaceholder")}
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
