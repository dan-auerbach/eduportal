"use client";

import { useSession, signOut } from "next-auth/react";
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
import { clearTenantCookies } from "@/actions/auth";
import type { NavCounts } from "@/hooks/use-nav-counts";

const UPDATES_LAST_SEEN_KEY = "mentor-updates-last-seen";

// ── Header component ────────────────────────────────────────────────────────

type HeaderProps = {
  tenantLogoUrl?: string | null;
  effectiveRole?: string;
  onMenuClick?: () => void;
  navCounts?: NavCounts;
};

export function Header({ tenantLogoUrl, effectiveRole, onMenuClick, navCounts }: HeaderProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const pathname = usePathname();

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "?";

  // Notification count from centralized nav-counts (suppress on notifications page)
  const isOnNotificationsPage = pathname === "/notifications";
  const unreadNotifications = isOnNotificationsPage ? 0 : (navCounts?.notificationsUnread ?? 0);

  // Updates unseen dot: compare latestUpdateAt from nav-counts with localStorage
  const isOnUpdatesPage = pathname === "/updates";
  let hasNewUpdates = false;
  if (typeof localStorage !== "undefined") {
    // When user visits updates page, mark as seen
    if (isOnUpdatesPage) {
      localStorage.setItem(UPDATES_LAST_SEEN_KEY, new Date().toISOString());
    } else if (navCounts?.latestUpdateAt) {
      const lastSeen = localStorage.getItem(UPDATES_LAST_SEEN_KEY);
      if (!lastSeen) {
        hasNewUpdates = true;
      } else {
        hasNewUpdates = new Date(navCounts.latestUpdateAt) > new Date(lastSeen);
      }
    }
  }

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
              onClick={async () => {
                await clearTenantCookies();
                signOut({ callbackUrl: "/auth/login" });
              }}
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
