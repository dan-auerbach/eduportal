"use client";

import { useEffect, useRef } from "react";

const USAGE_PING_INTERVAL = 60_000; // 60 seconds
const PRESENCE_PING_INTERVAL = 30_000; // 30 seconds

/**
 * Silent component that tracks user presence via periodic pings.
 * Mounted inside AppShell — renders nothing.
 *
 * Two heartbeats:
 *   1. Usage ping (/api/usage/ping) every 60s — DB-based session tracking
 *   2. Presence ping (/api/presence/ping) every 30s — Redis-based online status (visibility-aware)
 */
export function UsageTracker() {
  const usageRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // ── Usage ping (existing, unchanged) ─────────────────────────
    fetch("/api/usage/ping", { method: "POST" }).catch(() => {});
    usageRef.current = setInterval(() => {
      fetch("/api/usage/ping", { method: "POST" }).catch(() => {});
    }, USAGE_PING_INTERVAL);

    // ── Presence ping (new, visibility-aware) ────────────────────
    const presencePing = () => {
      if (!document.hidden) {
        fetch("/api/presence/ping", { method: "POST" }).catch(() => {});
      }
    };
    presencePing(); // immediate
    presenceRef.current = setInterval(presencePing, PRESENCE_PING_INTERVAL);

    // ── Cleanup on tab close ─────────────────────────────────────
    const handleBeforeUnload = () => {
      navigator.sendBeacon("/api/usage/end");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (usageRef.current) clearInterval(usageRef.current);
      if (presenceRef.current) clearInterval(presenceRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return null;
}
