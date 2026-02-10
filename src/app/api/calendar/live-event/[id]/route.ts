import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/**
 * Generates an .ics (iCalendar) file for a live event.
 * Works with Google Calendar, Outlook, Apple Calendar, etc.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Require authentication
  try {
    await getCurrentUser();
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const event = await prisma.mentorLiveEvent.findUnique({
    where: { id },
    select: {
      title: true,
      startsAt: true,
      meetUrl: true,
      instructions: true,
      tenant: { select: { name: true } },
    },
  });

  if (!event) {
    return new Response("Not found", { status: 404 });
  }

  // Event duration: default 1 hour
  const startDate = event.startsAt;
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  const description = [
    event.instructions ?? "",
    "",
    `Link: ${event.meetUrl}`,
  ]
    .join("\\n")
    .trim();

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Mentor//Live Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${id}@mentor.mojimediji.si`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(startDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${escapeICS(event.title)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    `URL:${event.meetUrl}`,
    `LOCATION:${event.meetUrl}`,
    event.tenant?.name ? `ORGANIZER;CN=${escapeICS(event.tenant.name)}:MAILTO:noreply@mentor.mojimediji.si` : "",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${sanitizeFilename(event.title)}.ics"`,
    },
  });
}

/** Format Date as iCalendar UTC timestamp: 20260210T143000Z */
function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape special characters in iCalendar text values */
function escapeICS(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Sanitize filename for Content-Disposition header */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 50);
}
