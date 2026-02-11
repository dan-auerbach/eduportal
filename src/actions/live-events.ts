"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError, requireTenantRole } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { CreateLiveEventSchema, UpdateLiveEventSchema } from "@/lib/validators";
import { sendLiveEventCreatedNotification } from "@/actions/email";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type LiveEventGroupDTO = {
  id: string;
  name: string;
  color: string | null;
};

export type LiveEventDTO = {
  id: string;
  title: string;
  startsAt: string; // ISO string
  meetUrl: string;
  instructions: string | null;
  relatedModule: { id: string; title: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  groups: LiveEventGroupDTO[];
  createdAt: string;
};

export type LiveEventsOverview = {
  nextEvent: LiveEventDTO | null;
  upcoming: LiveEventDTO[];
  past: LiveEventDTO[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const EVENT_SELECT = {
  id: true,
  title: true,
  startsAt: true,
  meetUrl: true,
  instructions: true,
  createdAt: true,
  relatedModule: {
    select: { id: true, title: true },
  },
  createdBy: {
    select: { firstName: true, lastName: true },
  },
  groups: {
    select: {
      group: {
        select: { id: true, name: true, color: true },
      },
    },
  },
} as const;

type RawEvent = {
  id: string;
  title: string;
  startsAt: Date;
  meetUrl: string;
  instructions: string | null;
  createdAt: Date;
  relatedModule: { id: string; title: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  groups: Array<{ group: { id: string; name: string; color: string | null } }>;
};

function toDTO(e: RawEvent): LiveEventDTO {
  return {
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    meetUrl: e.meetUrl,
    instructions: e.instructions,
    relatedModule: e.relatedModule
      ? { id: e.relatedModule.id, title: e.relatedModule.title }
      : null,
    createdBy: e.createdBy
      ? { firstName: e.createdBy.firstName, lastName: e.createdBy.lastName }
      : null,
    groups: e.groups.map((g) => ({
      id: g.group.id,
      name: g.group.name,
      color: g.group.color,
    })),
    createdAt: e.createdAt.toISOString(),
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get live events overview for the main page.
 * Returns next event (highlight), upcoming (max 5), and past (max 10).
 */
export async function getLiveEventsOverview(): Promise<ActionResult<LiveEventsOverview>> {
  try {
    const ctx = await getTenantContext();
    const now = new Date();

    const [allUpcoming, past] = await Promise.all([
      prisma.mentorLiveEvent.findMany({
        where: { tenantId: ctx.tenantId, startsAt: { gte: now } },
        orderBy: { startsAt: "asc" },
        take: 6, // 1 for highlight + 5 for list
        select: EVENT_SELECT,
      }),
      prisma.mentorLiveEvent.findMany({
        where: { tenantId: ctx.tenantId, startsAt: { lt: now } },
        orderBy: { startsAt: "desc" },
        take: 10,
        select: EVENT_SELECT,
      }),
    ]);

    const nextEvent = allUpcoming.length > 0 ? toDTO(allUpcoming[0] as RawEvent) : null;
    const upcoming = allUpcoming.slice(1).map((e) => toDTO(e as RawEvent));

    return {
      success: true,
      data: {
        nextEvent,
        upcoming,
        past: past.map((e) => toDTO(e as RawEvent)),
      },
    };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    console.error("[getLiveEventsOverview] unexpected error:", e);
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri nalaganju terminov" };
  }
}

/**
 * Get the next upcoming live event (lightweight, for sidebar sub-label).
 */
export async function getNextLiveEvent(
  tenantId: string,
): Promise<{ title: string; startsAt: string } | null> {
  try {
    const event = await prisma.mentorLiveEvent.findFirst({
      where: { tenantId, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      select: { title: true, startsAt: true },
    });
    if (!event) return null;
    return { title: event.title, startsAt: event.startsAt.toISOString() };
  } catch {
    return null;
  }
}

/**
 * Get published modules for the related-module dropdown in the admin form.
 */
export async function getPublishedModulesForSelect(): Promise<
  ActionResult<{ id: string; title: string }[]>
> {
  try {
    const ctx = await getTenantContext();
    const modules = await prisma.module.findMany({
      where: { tenantId: ctx.tenantId, status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    });
    return { success: true, data: modules };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

/**
 * Get groups for the group-select checkboxes in the admin form.
 */
export async function getGroupsForSelect(): Promise<
  ActionResult<{ id: string; name: string }[]>
> {
  try {
    const ctx = await getTenantContext();
    const groups = await prisma.group.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return { success: true, data: groups };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin CRUD ───────────────────────────────────────────────────────────────

/**
 * Create a new live event. Admin+ only.
 * Sends email notification to members of selected groups.
 */
export async function createLiveEvent(
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireTenantRole("ADMIN");
    const parsed = CreateLiveEventSchema.parse(data);

    const event = await prisma.mentorLiveEvent.create({
      data: {
        tenantId: ctx.tenantId,
        title: parsed.title.trim(),
        startsAt: new Date(parsed.startsAt),
        meetUrl: parsed.meetUrl.trim(),
        instructions: parsed.instructions?.trim() || null,
        relatedModuleId: parsed.relatedModuleId ?? null,
        createdById: ctx.user.id,
      },
    });

    // Link groups
    const groupIds = parsed.groupIds ?? [];
    if (groupIds.length > 0) {
      await prisma.liveEventGroup.createMany({
        data: groupIds.map((groupId) => ({
          eventId: event.id,
          groupId,
          tenantId: ctx.tenantId,
        })),
      });

      // Send email notification to group members (fire-and-forget)
      sendLiveEventCreatedNotification({
        eventId: event.id,
        tenantId: ctx.tenantId,
        groupIds,
        eventTitle: event.title,
        startsAt: event.startsAt,
        meetUrl: event.meetUrl,
      }).catch((err) => {
        console.error("[createLiveEvent] email notification error:", err);
      });
    }

    await logAudit({
      actorId: ctx.user.id,
      action: "LIVE_EVENT_CREATED",
      entityType: "MentorLiveEvent",
      entityId: event.id,
      tenantId: ctx.tenantId,
      metadata: { title: event.title, groupIds },
    });

    return { success: true, data: { id: event.id } };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri ustvarjanju termina" };
  }
}

/**
 * Update an existing live event. Admin+ only.
 * Does NOT send email notifications on update.
 */
export async function updateLiveEvent(
  id: string,
  data: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    // Verify event belongs to this tenant
    const existing = await prisma.mentorLiveEvent.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!existing || existing.tenantId !== ctx.tenantId) {
      return { success: false, error: "Termin ne obstaja" };
    }

    const parsed = UpdateLiveEventSchema.parse(data);

    const updateData: Record<string, unknown> = {};
    if (parsed.title !== undefined) updateData.title = parsed.title.trim();
    if (parsed.startsAt !== undefined) updateData.startsAt = new Date(parsed.startsAt);
    if (parsed.meetUrl !== undefined) updateData.meetUrl = parsed.meetUrl.trim();
    if (parsed.instructions !== undefined)
      updateData.instructions = parsed.instructions?.trim() || null;
    if (parsed.relatedModuleId !== undefined)
      updateData.relatedModuleId = parsed.relatedModuleId ?? null;

    await prisma.mentorLiveEvent.update({
      where: { id },
      data: updateData,
    });

    // Update groups if provided (replace all)
    if (parsed.groupIds !== undefined) {
      await prisma.liveEventGroup.deleteMany({ where: { eventId: id } });
      if (parsed.groupIds.length > 0) {
        await prisma.liveEventGroup.createMany({
          data: parsed.groupIds.map((groupId) => ({
            eventId: id,
            groupId,
            tenantId: ctx.tenantId,
          })),
        });
      }
    }

    await logAudit({
      actorId: ctx.user.id,
      action: "LIVE_EVENT_UPDATED",
      entityType: "MentorLiveEvent",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: {
        changes: [
          ...Object.keys(updateData),
          ...(parsed.groupIds !== undefined ? ["groupIds"] : []),
        ],
      },
    });

    return { success: true, data: { id } };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri urejanju termina" };
  }
}

/**
 * Delete a live event. Admin+ only.
 */
export async function deleteLiveEvent(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    // Verify event belongs to this tenant
    const existing = await prisma.mentorLiveEvent.findUnique({
      where: { id },
      select: { tenantId: true, title: true },
    });
    if (!existing || existing.tenantId !== ctx.tenantId) {
      return { success: false, error: "Termin ne obstaja" };
    }

    await prisma.mentorLiveEvent.delete({ where: { id } });

    await logAudit({
      actorId: ctx.user.id,
      action: "LIVE_EVENT_DELETED",
      entityType: "MentorLiveEvent",
      entityId: id,
      tenantId: ctx.tenantId,
      metadata: { title: existing.title },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri brisanju termina" };
  }
}
