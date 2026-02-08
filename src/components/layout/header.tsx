"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, LogOut, User, Menu, Megaphone } from "lucide-react";
import Link from "next/link";
import { t } from "@/lib/i18n";

const UPDATES_LAST_SEEN_KEY = "mentor-updates-last-seen";
const NOTIFICATION_POLL_INTERVAL = 30_000; // 30 seconds
const UPDATES_POLL_INTERVAL = 60_000; // 60 seconds

// ── Hook: unread notification count ─────────────────────────────────────────

function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pathname = usePathname();
  const isOnNotificationsPage = pathname === "/notifications";

  useEffect(() => {
    if (isOnNotificationsPage) {
      setCount(0);
      return;
    }

    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const data = await res.json();
          setCount(data.count ?? 0);
        }
      } catch {
        // ignore
      }
    };

    fetchCount();
    intervalRef.current = setInterval(fetchCount, NOTIFICATION_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOnNotificationsPage]);

  return count;
}

// ── Hook: unseen updates count ──────────────────────────────────────────────

function useUnseenUpdatesCount() {
  const [hasNew, setHasNew] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pathname = usePathname();
  const isOnUpdatesPage = pathname === "/updates";

  useEffect(() => {
    // When user visits updates page, mark all as seen
    if (isOnUpdatesPage) {
      localStorage.setItem(UPDATES_LAST_SEEN_KEY, new Date().toISOString());
      setHasNew(false);
      return;
    }

    const checkUpdates = async () => {
      try {
        const res = await fetch("/api/updates");
        if (res.ok) {
          const entries = await res.json();
          if (entries.length === 0) {
            setHasNew(false);
            return;
          }
          const lastSeen = localStorage.getItem(UPDATES_LAST_SEEN_KEY);
          if (!lastSeen) {
            // Never visited updates → show indicator
            setHasNew(true);
            return;
          }
          const lastSeenDate = new Date(lastSeen);
          const latestEntry = entries[0]; // sorted by createdAt desc
          const latestDate = new Date(latestEntry.createdAt);
          setHasNew(latestDate > lastSeenDate);
        }
      } catch {
        // ignore
      }
    };

    checkUpdates();
    intervalRef.current = setInterval(checkUpdates, UPDATES_POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOnUpdatesPage]);

  return hasNew;
}

// ── Header component ────────────────────────────────────────────────────────

type HeaderProps = {
  tenantLogoUrl?: string | null;
  effectiveRole?: string;
  onMenuClick?: () => void;
};

export function Header({ tenantLogoUrl, effectiveRole, onMenuClick }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "?";

  const unreadNotifications = useUnreadNotificationCount();
  const hasNewUpdates = useUnseenUpdatesCount();

  // Show updates icon to admin, super_admin, owner
  const canSeeUpdates =
    effectiveRole === "ADMIN" ||
    effectiveRole === "SUPER_ADMIN" ||
    effectiveRole === "OWNER";

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-3 md:px-6">
      <div className="flex items-center gap-2">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">{t("nav.openMenu")}</span>
        </Button>
        {tenantLogoUrl && (
          <Link href="/dashboard">
            <img src={tenantLogoUrl} alt={t("tenant.logoAlt")} className="h-9 w-auto max-w-[160px] rounded object-contain hidden md:block" />
          </Link>
        )}
      </div>
      <div className="flex items-center gap-1 md:gap-3">
        {/* Updates (Megaphone) — admin/owner only */}
        {canSeeUpdates && (
          <Button variant="ghost" size="icon" asChild className="relative">
            <Link href="/updates">
              <Megaphone className="h-4 w-4" />
              {hasNewUpdates && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
              )}
            </Link>
          </Button>
        )}

        {/* Notifications (Bell) */}
        <Button variant="ghost" size="icon" asChild className="relative">
          <Link href="/notifications">
            <Bell className="h-4 w-4" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm hidden sm:inline">
                {user?.firstName} {user?.lastName}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                {t("nav.profile")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              className="flex items-center gap-2 text-destructive"
            >
              <LogOut className="h-4 w-4" />
              {t("nav.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
