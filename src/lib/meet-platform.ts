/**
 * Shared utility for detecting video meeting platform from URL.
 * Used by both server components (page.tsx) and client components (live-event-form.tsx).
 */

export type MeetPlatform = "meet" | "teams" | "other";

export function detectPlatform(url: string): MeetPlatform {
  if (/meet\.google\.com/i.test(url)) return "meet";
  if (/teams\.microsoft\.com|teams\.live\.com/i.test(url)) return "teams";
  return "other";
}
