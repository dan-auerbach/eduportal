"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Award,
  User,
  Users,
  FolderOpen,
  BarChart3,
  Settings,
  FileText,
  AlertTriangle,
  Building2,
  Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; labelKey: string; icon: LucideIcon; ownerOnly?: boolean };

const employeeNav: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/modules", labelKey: "nav.modules", icon: BookOpen },
  { href: "/certificates", labelKey: "nav.certificates", icon: Award },
  { href: "/chat", labelKey: "nav.chat", icon: Hash },
  { href: "/profile", labelKey: "nav.profile", icon: User },
];

const adminNav: NavItem[] = [
  { href: "/admin", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/admin/modules", labelKey: "nav.modules", icon: BookOpen },
  { href: "/admin/users", labelKey: "nav.users", icon: Users },
  { href: "/admin/groups", labelKey: "nav.groups", icon: FolderOpen },
  { href: "/admin/progress", labelKey: "nav.progress", icon: BarChart3 },
  { href: "/admin/late-users", labelKey: "nav.lateUsers", icon: AlertTriangle },
  { href: "/admin/audit-log", labelKey: "nav.auditLog", icon: FileText, ownerOnly: true },
  { href: "/admin/settings", labelKey: "nav.settings", icon: Settings },
];

const ownerNav: NavItem[] = [
  { href: "/owner", labelKey: "nav.tenants", icon: Building2 },
];

// ── Chat unread badge hook ───────────────────────────────────────────────────

const LAST_READ_KEY_PREFIX = "ircLastRead:";
const POLL_INTERVAL = 15_000; // 15 seconds

function useChatUnreadCount(tenantId: string | undefined, isOnChatPage: boolean) {
  const [count, setCount] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    // When user is on chat page, always show 0
    if (isOnChatPage) {
      setCount(0);
      return;
    }

    const fetchUnread = async () => {
      try {
        const lastRead = localStorage.getItem(`${LAST_READ_KEY_PREFIX}${tenantId}`) ?? "";
        const url = lastRead
          ? `/api/chat/unread?after=${encodeURIComponent(lastRead)}`
          : `/api/chat/unread`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setCount(data.count ?? 0);
        }
      } catch {
        // ignore
      }
    };

    fetchUnread();
    intervalRef.current = setInterval(fetchUnread, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tenantId, isOnChatPage]);

  return count;
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

type SidebarProps = {
  tenantId?: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  onNavigate?: () => void;
};

/**
 * SidebarContent — shared nav content used in both desktop sidebar and mobile drawer.
 */
export function SidebarContent({ tenantId, tenantName, tenantLogoUrl, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isOwner = role === "OWNER";

  const isInAdminSection = pathname.startsWith("/admin");
  const isInOwnerSection = pathname.startsWith("/owner");
  const isOnChatPage = pathname === "/chat" || pathname.startsWith("/chat/");

  const rawNavItems = isInOwnerSection && isOwner
    ? ownerNav
    : isInAdminSection && (isAdmin || isOwner)
      ? adminNav
      : employeeNav;

  const navItems = rawNavItems.filter((item) => !item.ownerOnly || isOwner);

  const chatUnread = useChatUnreadCount(tenantId, isOnChatPage);

  return (
    <>
      {/* Logo + tenant — click navigates to dashboard */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex h-14 items-center gap-2 border-b px-4 hover:bg-muted/50 transition-colors"
      >
        {tenantLogoUrl ? (
          <img src={tenantLogoUrl} alt={tenantName || "Logo"} width={24} height={24} className="h-6 w-6 rounded object-contain" />
        ) : (
          <GraduationCap className="h-6 w-6 text-primary" />
        )}
        <span className="text-lg font-semibold truncate">{tenantName || t("nav.appName")}</span>
      </Link>

      {/* Section toggle */}
      {(isAdmin || isOwner) && (
        <div className="flex border-b p-2">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
              !isInAdminSection && !isInOwnerSection ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {t("nav.portal")}
          </Link>
          <Link
            href="/admin"
            onClick={onNavigate}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
              isInAdminSection ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {t("nav.admin")}
          </Link>
          {isOwner && (
            <Link
              href="/owner"
              onClick={onNavigate}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors",
                isInOwnerSection ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {t("nav.owner")}
            </Link>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : item.href === "/dashboard"
                ? pathname === "/dashboard"
                : item.href === "/owner"
                  ? pathname === "/owner"
                  : pathname.startsWith(item.href);

          const isChatItem = item.href === "/chat";
          const showBadge = isChatItem && chatUnread > 0;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              <span className="flex-1">{t(item.labelKey)}</span>
              {showBadge && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

/**
 * Desktop sidebar — hidden on mobile, shown on md+
 */
export function Sidebar({ tenantId, tenantName, tenantLogoUrl }: SidebarProps) {
  return (
    <aside className="hidden md:flex h-full w-64 flex-col border-r bg-card">
      <SidebarContent tenantId={tenantId} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} />
    </aside>
  );
}
