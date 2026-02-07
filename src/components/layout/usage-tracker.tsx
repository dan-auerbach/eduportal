"use client";

import { useEffect, useRef } from "react";

const PING_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Silent component that tracks user presence via periodic pings.
 * Mounted inside AppShell — renders nothing.
 */
export function UsageTracker() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Ping immediately on mount
    fetch("/api/usage/ping", { method: "POST" }).catch(() => {});

    // Then ping every 60s
    intervalRef.current = setInterval(() => {
      fetch("/api/usage/ping", { method: "POST" }).catch(() => {});
    }, PING_INTERVAL_MS);

    // On tab close / navigate away — fire end session via sendBeacon
    const handleBeforeUnload = () => {
      navigator.sendBeacon("/api/usage/end");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  return null;
}
