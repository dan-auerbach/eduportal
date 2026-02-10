"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const NAV_COUNTS_INTERVAL = 60_000; // 60 seconds
const LAST_READ_KEY_PREFIX = "ircLastRead:";

export type NavCounts = {
  chatUnread: number;
  radarUnread: number;
  notificationsUnread: number;
  latestUpdateAt: string | null;
  nextLiveEvent: { title: string; startsAt: string } | null;
};

const EMPTY: NavCounts = {
  chatUnread: 0,
  radarUnread: 0,
  notificationsUnread: 0,
  latestUpdateAt: null,
  nextLiveEvent: null,
};

/**
 * Single hook that fetches all navigation badge counts via /api/nav-counts.
 * - Polls every 60s
 * - Refreshes on window focus (after at least 10s since last fetch)
 * - Pauses when document is hidden (background tab)
 * - Deduplicates in-flight requests
 * - Uses AbortController for proper cleanup
 */
export function useNavCounts(tenantId: string | undefined): NavCounts {
  const [counts, setCounts] = useState<NavCounts>(EMPTY);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchCounts = useCallback(async () => {
    if (!tenantId || inFlightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;

    inFlightRef.current = true;

    // Abort any previous request still pending
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const lastRead =
        typeof localStorage !== "undefined"
          ? localStorage.getItem(`${LAST_READ_KEY_PREFIX}${tenantId}`) ?? ""
          : "";

      const url = lastRead
        ? `/api/nav-counts?chatAfter=${encodeURIComponent(lastRead)}`
        : "/api/nav-counts";

      const res = await fetch(url, { signal: controller.signal });

      if (res.ok) {
        const data: NavCounts = await res.json();
        setCounts(data);
        lastFetchRef.current = Date.now();
      }
    } catch (e) {
      // Ignore abort errors and network failures
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      inFlightRef.current = false;
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    // Fetch immediately
    fetchCounts();

    // Poll every 60s
    intervalRef.current = setInterval(fetchCounts, NAV_COUNTS_INTERVAL);

    // Refresh on window focus (with 10s debounce)
    const handleFocus = () => {
      if (Date.now() - lastFetchRef.current > 10_000) {
        fetchCounts();
      }
    };

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (document.hidden) {
        // Pause: clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        // Resume: fetch now + restart interval
        fetchCounts();
        if (!intervalRef.current) {
          intervalRef.current = setInterval(fetchCounts, NAV_COUNTS_INTERVAL);
        }
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      abortRef.current?.abort();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [tenantId, fetchCounts]);

  return counts;
}
