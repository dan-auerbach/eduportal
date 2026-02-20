"use server";

import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError, requireTenantRole } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { awardXp, XP_RULES } from "@/lib/xp";
import { rateLimitAttendanceRegister, rateLimitAttendanceConfirm } from "@/lib/rate-limit";
import { withAction } from "@/lib/observability";
import type { ActionResult } from "@/types";
import type { AttendanceStatus } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type AttendanceDTO = {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: AttendanceStatus;
  xpAwarded: boolean;
  registeredAt: string;
  confirmedAt: string | null;
  confirmedByName: string | null;
};

export type AttendanceSummary = {
  registered: number;
  cancelled: number;
  attended: number;
  noShow: number;
  total: number;
};

// ── Employee: Register for Event ─────────────────────────────────────────────

export async function registerForEvent(
  eventId: string,
): Promise<ActionResult<{ status: AttendanceStatus }>> {
  return withAction("registerForEvent", async ({ log }) => {
    const ctx = await getTenantContext();

    const rl = await rateLimitAttendanceRegister(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč zahtevkov, poskusite pozneje" };

    // Verify event exists and belongs to tenant
    const event = await prisma.mentorLiveEvent.findUnique({
      where: { id: eventId },
      select: { tenantId: true, title: true, startsAt: true },
    });
    if (!event || event.tenantId !== ctx.tenantId) {
      return { success: false, error: "Termin ne obstaja" };
    }

    // Check if event is in the future
    if (new Date() >= event.startsAt) {
      return { success: false, error: "Prijava ni več mogoča — termin se je že začel" };
    }

    // Upsert: create or update existing attendance (re-register after cancellation)
    const attendance = await prisma.liveEventAttendance.upsert({
      where: { eventId_userId: { eventId, userId: ctx.user.id } },
      create: {
        eventId,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
        status: "REGISTERED",
      },
      update: {
        status: "REGISTERED",
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "ATTENDANCE_REGISTERED",
      entityType: "LiveEventAttendance",
      entityId: attendance.id,
      metadata: { eventId, eventTitle: event.title },
    });

    log({ eventId, eventTitle: event.title });

    return { success: true, data: { status: "REGISTERED" } };
  });
}

// ── Employee: Cancel Registration ────────────────────────────────────────────

export async function cancelRegistration(
  eventId: string,
): Promise<ActionResult<{ status: AttendanceStatus }>> {
  return withAction("cancelRegistration", async ({ log }) => {
    const ctx = await getTenantContext();

    const attendance = await prisma.liveEventAttendance.findUnique({
      where: { eventId_userId: { eventId, userId: ctx.user.id } },
      select: { id: true, tenantId: true, status: true, xpAwarded: true },
    });
    if (!attendance || attendance.tenantId !== ctx.tenantId) {
      return { success: false, error: "Prijava ne obstaja" };
    }

    // If was ATTENDED and XP was awarded, reverse XP atomically (D4 fix)
    if (attendance.status === "ATTENDED" && attendance.xpAwarded) {
      try {
        await prisma.$transaction([
          prisma.xpTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              amount: -XP_RULES.EVENT_ATTENDED,
              source: "EVENT_ATTENDED",
              sourceEntityId: `${eventId}:reversal`,
              description: "Preklicana prisotnost na dogodku",
            },
          }),
          prisma.userXpBalance.updateMany({
            where: { userId: ctx.user.id, tenantId: ctx.tenantId },
            data: {
              totalXp: { decrement: XP_RULES.EVENT_ATTENDED },
              lifetimeXp: { decrement: XP_RULES.EVENT_ATTENDED },
            },
          }),
        ]);
      } catch {
        // Best effort reversal
      }
    }

    await prisma.liveEventAttendance.update({
      where: { id: attendance.id },
      data: { status: "CANCELLED", xpAwarded: false, xpTransactionId: null },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "ATTENDANCE_CANCELLED",
      entityType: "LiveEventAttendance",
      entityId: attendance.id,
      metadata: { eventId },
    });

    log({ eventId, previousStatus: attendance.status, xpReversed: attendance.xpAwarded });

    return { success: true, data: { status: "CANCELLED" } };
  });
}

// ── Employee: Get My Attendance ──────────────────────────────────────────────

export async function getMyAttendance(
  eventId: string,
): Promise<ActionResult<{ status: AttendanceStatus } | null>> {
  try {
    const ctx = await getTenantContext();

    const attendance = await prisma.liveEventAttendance.findUnique({
      where: { eventId_userId: { eventId, userId: ctx.user.id } },
      select: { status: true },
    });

    return { success: true, data: attendance ? { status: attendance.status } : null };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Employee: Get My Attendance for Multiple Events ─────────────────────

export type MyAttendanceMap = Record<
  string,
  { status: AttendanceStatus; xpAwarded: boolean } | null
>;

export async function getMyAttendanceBatch(
  eventIds: string[],
): Promise<ActionResult<MyAttendanceMap>> {
  try {
    const ctx = await getTenantContext();

    if (eventIds.length === 0) {
      return { success: true, data: {} };
    }

    const attendances = await prisma.liveEventAttendance.findMany({
      where: {
        eventId: { in: eventIds },
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
      },
      select: { eventId: true, status: true, xpAwarded: true },
    });

    const map: MyAttendanceMap = {};
    for (const eid of eventIds) {
      map[eid] = null;
    }
    for (const a of attendances) {
      map[a.eventId] = { status: a.status, xpAwarded: a.xpAwarded };
    }

    return { success: true, data: map };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Get Event Attendees ───────────────────────────────────────────────

export async function getEventAttendees(
  eventId: string,
): Promise<ActionResult<AttendanceDTO[]>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const attendances = await prisma.liveEventAttendance.findMany({
      where: { eventId, tenantId: ctx.tenantId },
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        confirmedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { registeredAt: "asc" },
    });

    return {
      success: true,
      data: attendances.map((a) => ({
        id: a.id,
        eventId: a.eventId,
        userId: a.userId,
        userName: `${a.user.firstName} ${a.user.lastName}`,
        userEmail: a.user.email,
        status: a.status,
        xpAwarded: a.xpAwarded,
        registeredAt: a.registeredAt.toISOString(),
        confirmedAt: a.confirmedAt?.toISOString() ?? null,
        confirmedByName: a.confirmedBy
          ? `${a.confirmedBy.firstName} ${a.confirmedBy.lastName}`
          : null,
      })),
    };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}

// ── Admin: Confirm Attendance (single) ───────────────────────────────────────

export async function confirmAttendance(
  eventId: string,
  userId: string,
): Promise<ActionResult<{ xpAwarded: boolean }>> {
  return withAction("confirmAttendance", async ({ log }) => {
    const ctx = await requireTenantRole("ADMIN");

    const rl = await rateLimitAttendanceConfirm(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč zahtevkov, poskusite pozneje" };

    // Find or create attendance record
    let attendance = await prisma.liveEventAttendance.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true, tenantId: true, status: true, xpAwarded: true },
    });

    if (!attendance) {
      // Create attendance record if user hasn't registered (admin marking directly)
      attendance = await prisma.liveEventAttendance.create({
        data: {
          eventId,
          userId,
          tenantId: ctx.tenantId,
          status: "ATTENDED",
          confirmedById: ctx.user.id,
          confirmedAt: new Date(),
        },
        select: { id: true, tenantId: true, status: true, xpAwarded: true },
      });
    } else if (attendance.tenantId !== ctx.tenantId) {
      return { success: false, error: "Prisotnost ne obstaja" };
    }

    // Update status to ATTENDED
    const updateData: Record<string, unknown> = {
      status: "ATTENDED",
      confirmedById: ctx.user.id,
      confirmedAt: new Date(),
    };

    // Award XP if not already awarded (idempotent)
    let xpAwarded = attendance.xpAwarded;
    if (!xpAwarded) {
      try {
        const result = await awardXp({
          userId,
          tenantId: ctx.tenantId,
          amount: XP_RULES.EVENT_ATTENDED,
          source: "EVENT_ATTENDED",
          sourceEntityId: eventId,
          description: "Prisotnost na dogodku v živo",
        });
        updateData.xpAwarded = true;
        updateData.xpTransactionId = result.newTotal.toString();
        xpAwarded = true;
      } catch {
        // Unique constraint violation = already awarded via another path
        updateData.xpAwarded = true;
        xpAwarded = true;
      }
    }

    await prisma.liveEventAttendance.update({
      where: { id: attendance.id },
      data: updateData,
    });

    // Notify user
    await prisma.notification.create({
      data: {
        userId,
        tenantId: ctx.tenantId,
        type: "EVENT_ATTENDANCE_CONFIRMED",
        title: "Prisotnost potrjena",
        message: xpAwarded
          ? `Vaša prisotnost je bila potrjena. Prejeli ste ${XP_RULES.EVENT_ATTENDED} XP.`
          : "Vaša prisotnost je bila potrjena.",
        link: "/mentor-v-zivo",
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "ATTENDANCE_CONFIRMED",
      entityType: "LiveEventAttendance",
      entityId: attendance.id,
      metadata: { eventId, userId, xpAwarded },
    });

    log({ eventId, userId, xpAwarded });

    return { success: true, data: { xpAwarded } };
  });
}

// ── Admin: Bulk Confirm Attendance ───────────────────────────────────────────

export async function bulkConfirmAttendance(
  eventId: string,
  userIds: string[],
): Promise<ActionResult<{ confirmed: number; xpAwarded: number }>> {
  return withAction("bulkConfirmAttendance", async ({ log }) => {
    const ctx = await requireTenantRole("ADMIN");

    const rl = await rateLimitAttendanceConfirm(ctx.user.id);
    if (!rl.success) return { success: false, error: "Preveč zahtevkov, poskusite pozneje" };

    // Verify event
    const event = await prisma.mentorLiveEvent.findUnique({
      where: { id: eventId },
      select: { tenantId: true },
    });
    if (!event || event.tenantId !== ctx.tenantId) {
      return { success: false, error: "Termin ne obstaja" };
    }

    let confirmed = 0;
    let xpAwardedCount = 0;

    // Process concurrently with controlled parallelism (P1 partial fix)
    const BATCH_SIZE = 5;
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      const batch = userIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((uid) => confirmAttendance(eventId, uid)),
      );
      for (const result of results) {
        if (result.success) {
          confirmed++;
          if (result.data.xpAwarded) xpAwardedCount++;
        }
      }
    }

    log({ eventId, confirmed, xpAwarded: xpAwardedCount, totalRequested: userIds.length });

    return { success: true, data: { confirmed, xpAwarded: xpAwardedCount } };
  });
}

// ── Admin: Revoke Attendance (mark as NO_SHOW) ──────────────────────────────

export async function revokeAttendance(
  eventId: string,
  userId: string,
): Promise<ActionResult<void>> {
  return withAction("revokeAttendance", async ({ log }) => {
    const ctx = await requireTenantRole("ADMIN");

    const attendance = await prisma.liveEventAttendance.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true, tenantId: true, status: true, xpAwarded: true },
    });
    if (!attendance || attendance.tenantId !== ctx.tenantId) {
      return { success: false, error: "Prisotnost ne obstaja" };
    }

    // Reverse XP atomically if was awarded (D4 fix)
    if (attendance.xpAwarded) {
      try {
        await prisma.$transaction([
          prisma.xpTransaction.create({
            data: {
              tenantId: ctx.tenantId,
              userId,
              amount: -XP_RULES.EVENT_ATTENDED,
              source: "EVENT_ATTENDED",
              sourceEntityId: `${eventId}:reversal`,
              description: "Preklicana prisotnost — označen kot odsoten",
            },
          }),
          prisma.userXpBalance.updateMany({
            where: { userId, tenantId: ctx.tenantId },
            data: {
              totalXp: { decrement: XP_RULES.EVENT_ATTENDED },
              lifetimeXp: { decrement: XP_RULES.EVENT_ATTENDED },
            },
          }),
        ]);
      } catch {
        // Best effort
      }
    }

    await prisma.liveEventAttendance.update({
      where: { id: attendance.id },
      data: {
        status: "NO_SHOW",
        xpAwarded: false,
        xpTransactionId: null,
        confirmedById: ctx.user.id,
        confirmedAt: new Date(),
      },
    });

    await logAudit({
      actorId: ctx.user.id,
      tenantId: ctx.tenantId,
      action: "ATTENDANCE_REVOKED",
      entityType: "LiveEventAttendance",
      entityId: attendance.id,
      metadata: { eventId, userId, previousXpAwarded: attendance.xpAwarded },
    });

    log({ eventId, userId, xpReversed: attendance.xpAwarded });

    return { success: true, data: undefined };
  });
}

// ── Admin: Attendance Summary ────────────────────────────────────────────────

export async function getAttendanceSummary(
  eventId: string,
): Promise<ActionResult<AttendanceSummary>> {
  try {
    const ctx = await requireTenantRole("ADMIN");

    const counts = await prisma.liveEventAttendance.groupBy({
      by: ["status"],
      where: { eventId, tenantId: ctx.tenantId },
      _count: true,
    });

    const summary: AttendanceSummary = {
      registered: 0,
      cancelled: 0,
      attended: 0,
      noShow: 0,
      total: 0,
    };

    for (const row of counts) {
      const count = row._count;
      switch (row.status) {
        case "REGISTERED":
          summary.registered = count;
          break;
        case "CANCELLED":
          summary.cancelled = count;
          break;
        case "ATTENDED":
          summary.attended = count;
          break;
        case "NO_SHOW":
          summary.noShow = count;
          break;
      }
      summary.total += count;
    }

    return { success: true, data: summary };
  } catch (e) {
    if (e instanceof TenantAccessError) return { success: false, error: e.message };
    return { success: false, error: e instanceof Error ? e.message : "Napaka" };
  }
}
