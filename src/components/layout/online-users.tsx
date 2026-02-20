"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Circle } from "lucide-react";
import { t } from "@/lib/i18n";

type OnlineUser = {
  userId: string;
  displayName: string;
};

const POLL_INTERVAL = 30_000;
const MAX_VISIBLE = 8;

/**
 * Sidebar widget showing currently online users for the active tenant.
 * Polls /api/presence/online every 30s, pauses when tab is hidden.
 */
export function OnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOnline = useCallback(async () => {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/presence/online?limit=20");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } catch {
      // ignore network errors
    }
  }, []);

  useEffect(() => {
    fetchOnline();
    intervalRef.current = setInterval(fetchOnline, POLL_INTERVAL);

    const handleVisibility = () => {
      if (!document.hidden) fetchOnline();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchOnline]);

  if (users.length === 0) return null;

  return (
    <div className="px-4 py-3 border-t">
      <div className="flex items-center gap-1.5 mb-2">
        <Circle className="h-2 w-2 fill-green-500 text-green-500" />
        <span className="text-xs font-medium text-muted-foreground">
          {t("nav.online")} ({users.length})
        </span>
      </div>
      <div className="space-y-0.5">
        {users.slice(0, MAX_VISIBLE).map((u) => (
          <div key={u.userId} className="text-xs text-muted-foreground truncate pl-3.5">
            {u.displayName}
          </div>
        ))}
        {users.length > MAX_VISIBLE && (
          <div className="text-xs text-muted-foreground pl-3.5">
            +{users.length - MAX_VISIBLE}
          </div>
        )}
      </div>
    </div>
  );
}
