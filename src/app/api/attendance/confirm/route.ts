import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { awardXp, XP_RULES } from "@/lib/xp";
import { logAudit } from "@/lib/audit";

/**
 * Signed attendance confirmation endpoint.
 * Admin sends a signed link to attendees. Clicking it marks ATTENDED + awards XP.
 *
 * GET /api/attendance/confirm?eventId=...&userId=...&tenantId=...&token=...
 *
 * Token = HMAC-SHA256(eventId:userId:tenantId, CRON_SECRET)
 */

function generateToken(eventId: string, userId: string, tenantId: string): string {
  const secret = process.env.CRON_SECRET ?? "";
  return createHmac("sha256", secret)
    .update(`${eventId}:${userId}:${tenantId}`)
    .digest("hex");
}

function verifyToken(eventId: string, userId: string, tenantId: string, token: string): boolean {
  const expected = generateToken(eventId, userId, tenantId);
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  const userId = searchParams.get("userId");
  const tenantId = searchParams.get("tenantId");
  const token = searchParams.get("token");

  if (!eventId || !userId || !tenantId || !token) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  if (!verifyToken(eventId, userId, tenantId, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  // Verify event exists
  const event = await prisma.mentorLiveEvent.findUnique({
    where: { id: eventId },
    select: { tenantId: true, title: true },
  });
  if (!event || event.tenantId !== tenantId) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Find or create attendance
  let attendance = await prisma.liveEventAttendance.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (!attendance) {
    attendance = await prisma.liveEventAttendance.create({
      data: {
        eventId,
        userId,
        tenantId,
        status: "ATTENDED",
        confirmedAt: new Date(),
      },
    });
  }

  // Update to ATTENDED if not already
  if (attendance.status !== "ATTENDED") {
    await prisma.liveEventAttendance.update({
      where: { id: attendance.id },
      data: { status: "ATTENDED", confirmedAt: new Date() },
    });
  }

  // Award XP if not already awarded
  if (!attendance.xpAwarded) {
    try {
      await awardXp({
        userId,
        tenantId,
        amount: XP_RULES.EVENT_ATTENDED,
        source: "EVENT_ATTENDED",
        sourceEntityId: eventId,
        description: "Prisotnost na dogodku v živo",
      });

      await prisma.liveEventAttendance.update({
        where: { id: attendance.id },
        data: { xpAwarded: true },
      });
    } catch {
      // Idempotent — already awarded
      await prisma.liveEventAttendance.update({
        where: { id: attendance.id },
        data: { xpAwarded: true },
      });
    }
  }

  // Notify user
  await prisma.notification.create({
    data: {
      userId,
      tenantId,
      type: "EVENT_ATTENDANCE_CONFIRMED",
      title: "Prisotnost potrjena",
      message: `Vaša prisotnost na "${event.title}" je bila potrjena. Prejeli ste ${XP_RULES.EVENT_ATTENDED} XP.`,
      link: "/mentor-v-zivo",
    },
  });

  await logAudit({
    actorId: userId,
    tenantId,
    action: "ATTENDANCE_CONFIRMED",
    entityType: "LiveEventAttendance",
    entityId: attendance.id,
    metadata: { eventId, via: "email-token" },
  });

  // Redirect to the live events page with a success message
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "";
  return NextResponse.redirect(`${baseUrl}/mentor-v-zivo?attendance=confirmed`, { status: 302 });
}

/**
 * Generate a signed attendance confirmation URL.
 * Called from admin actions to build the link that gets emailed.
 */
export function buildAttendanceConfirmUrl(
  eventId: string,
  userId: string,
  tenantId: string,
): string {
  const token = generateToken(eventId, userId, tenantId);
  const baseUrl = process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL ?? "";
  return `${baseUrl}/api/attendance/confirm?eventId=${eventId}&userId=${userId}&tenantId=${tenantId}&token=${token}`;
}
