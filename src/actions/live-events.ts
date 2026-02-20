"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError, requireTenantRole } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { CreateLiveEventSchema, UpdateLiveEventSchema } from "@/lib/validators";
import { sendLiveEventCreatedNotification } from "@/actions/email";
import type { ActionResult } from "@/types";
import type { LiveEventLocationType } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type LiveEventGroupDTO = {
  id: string;
  name: string;
  color: string | null;
};

export type LiveEventMaterialDTO = {
  id: string;
  assetId: string;
  title: string;
  mimeType: string | null;
  sizeBytes: string | null; // BigInt serialized
  visibleBeforeEvent: boolean;
  createdAt: string;
};

export type LiveEventDTO = {
  id: string;
  title: string;
  startsAt: string; // ISO string
  meetUrl: string; // legacy, kept for compat
  locationType: LiveEventLocationType;
  onlineUrl: string | null;
  physicalLocation: string | null;
  instructions: string | null;
  relatedModule: { id: string; title: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  groups: LiveEventGroupDTO[];
  materials: LiveEventMaterialDTO[];
  attendeeCount: number;
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
  locationType: true,
  onlineUrl: true,
  physicalLocation: true,
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
  materials: {
    select: {
      id: true,
      assetId: true,
      visibleBeforeEvent: true,
      createdAt: true,
      asset: {
        select: { title: true, mimeType: true, sizeBytes: true },
      },
    },
  },
  _count: {
    select: { attendances: true },
  },
} as const;

type RawEvent = {
  id: string;
  title: string;
  startsAt: Date;
  meetUrl: string;
  locationType: LiveEventLocationType;
  onlineUrl: string | null;
  physicalLocation: string | null;
  instructions: string | null;
  createdAt: Date;
  relatedModule: { id: string; title: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  groups: Array<{ group: { id: string; name: string; color: string | null } }>;
  materials: Array<{
    id: string;
    assetId: string;
    visibleBeforeEvent: boolean;
    createdAt: Date;
    asset: { title: string; mimeType: string | null; sizeBytes: bigint | null };
  }>;
  _count: { attendances: number };
};

function toDTO(e: RawEvent): LiveEventDTO {
  return {
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    meetUrl: e.meetUrl,
    locationType: e.locationType,
    onlineUrl: e.onlineUrl,
    physicalLocation: e.physicalLocation,
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
    materials: e.materials.map((m) => ({
      id: m.id,
      assetId: m.assetId,
      title: m.asset.title,
      mimeType: m.asset.mimeType,
      sizeBytes: m.asset.sizeBytes?.toString() ?? null,
      visibleBeforeEvent: m.visibleBeforeEvent,
      createdAt: m.createdAt.toISOString(),
    })),
    attendeeCount: e._count.attendances,
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

    // Determine effective URL for meetUrl (legacy) and onlineUrl
    const locationType = (parsed.locationType ?? "ONLINE") as LiveEventLocationType;
    const onlineUrl = locationType !== "PHYSICAL" ? (parsed.onlineUrl ?? parsed.meetUrl)?.trim() || null : null;
    const physicalLocation = locationType !== "ONLINE" ? parsed.physicalLocation?.trim() || null : null;
    const meetUrlValue = onlineUrl ?? parsed.meetUrl?.trim() ?? "";

    const event = await prisma.mentorLiveEvent.create({
      data: {
        tenantId: ctx.tenantId,
        title: parsed.title.trim(),
        startsAt: new Date(parsed.startsAt),
        meetUrl: meetUrlValue, // legacy field, kept for compat
        locationType,
        onlineUrl,
        physicalLocation,
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
        meetUrl: onlineUrl ?? meetUrlValue, // use onlineUrl for new events
        physicalLocation,
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
    if (parsed.locationType !== undefined) updateData.locationType = parsed.locationType;
    if (parsed.onlineUrl !== undefined) updateData.onlineUrl = parsed.onlineUrl?.trim() || null;
    if (parsed.physicalLocation !== undefined) updateData.physicalLocation = parsed.physicalLocation?.trim() || null;
    if (parsed.instructions !== undefined)
      updateData.instructions = parsed.instructions?.trim() || null;
    if (parsed.relatedModuleId !== undefined)
      updateData.relatedModuleId = parsed.relatedModuleId ?? null;
    // Keep meetUrl in sync with onlineUrl for backward compat
    if (parsed.onlineUrl !== undefined && !updateData.meetUrl) {
      updateData.meetUrl = parsed.onlineUrl?.trim() || "";
    }

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

// ── Material Management ──────────────────────────────────────────────────────

/**
 * Add a material (document asset) to a live event. Admin+ only.
 */
export async function addLiveEventMaterial(
  eventId: string,
  assetId: string,
  visibleBeforeEvent: boolean = false,
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    // Verify event belongs to this tenant
    const event = await prisma.mentorLiveEvent.findUnique({
      where: { id: eventId },
      select: { tenantId: true, title: true },
    });
    if (!event || event.tenantId !== ctx.tenantId) {
      return { success: false, error: "Termin ne obstaja" };
    }

    // Verify asset belongs to this tenant and is a document
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { tenantId: true, type: true, title: true },
    });
    if (!asset || asset.tenantId !== ctx.tenantId) {
      return { success: false, error: "Datoteka ne obstaja" };
    }

    const material = await prisma.liveEventMaterial.create({
      data: {
        eventId,
        assetId,
        tenantId: ctx.tenantId,
        visibleBeforeEvent,
        addedById: ctx.user.id,
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      action: "LIVE_EVENT_MATERIAL_ADDED",
      entityType: "LiveEventMaterial",
      entityId: material.id,
      tenantId: ctx.tenantId,
      metadata: { eventId, assetId, assetTitle: asset.title, eventTitle: event.title },
    });

    return { success: true, data: { id: material.id } };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri dodajanju gradiva" };
  }
}

/**
 * Remove a material from a live event. Admin+ only.
 */
export async function removeLiveEventMaterial(
  materialId: string,
): Promise<ActionResult<void>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const material = await prisma.liveEventMaterial.findUnique({
      where: { id: materialId },
      select: { tenantId: true, eventId: true, assetId: true, asset: { select: { title: true } } },
    });
    if (!material || material.tenantId !== ctx.tenantId) {
      return { success: false, error: "Gradivo ne obstaja" };
    }

    await prisma.liveEventMaterial.delete({ where: { id: materialId } });

    await logAudit({
      actorId: ctx.user.id,
      action: "LIVE_EVENT_MATERIAL_REMOVED",
      entityType: "LiveEventMaterial",
      entityId: materialId,
      tenantId: ctx.tenantId,
      metadata: { eventId: material.eventId, assetId: material.assetId, assetTitle: material.asset.title },
    });

    return { success: true, data: undefined };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka pri odstranjevanju gradiva" };
  }
}

/**
 * Get materials for a live event. Employees see materials based on visibleBeforeEvent flag.
 */
export async function getLiveEventMaterials(
  eventId: string,
): Promise<ActionResult<LiveEventMaterialDTO[]>> {
  try {
    const ctx = await getTenantContext();

    const event = await prisma.mentorLiveEvent.findUnique({
      where: { id: eventId },
      select: { tenantId: true, startsAt: true },
    });
    if (!event || event.tenantId !== ctx.tenantId) {
      return { success: false, error: "Termin ne obstaja" };
    }

    const now = new Date();
    const isBeforeEvent = now < event.startsAt;
    const isAdmin = ["OWNER", "SUPER_ADMIN", "ADMIN"].includes(ctx.effectiveRole);

    const materials = await prisma.liveEventMaterial.findMany({
      where: {
        eventId,
        tenantId: ctx.tenantId,
        // Non-admin users before event only see materials marked visibleBeforeEvent
        ...(!isAdmin && isBeforeEvent ? { visibleBeforeEvent: true } : {}),
      },
      include: {
        asset: { select: { title: true, mimeType: true, sizeBytes: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      data: materials.map((m) => ({
        id: m.id,
        assetId: m.assetId,
        title: m.asset.title,
        mimeType: m.asset.mimeType,
        sizeBytes: m.asset.sizeBytes?.toString() ?? null,
        visibleBeforeEvent: m.visibleBeforeEvent,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}
