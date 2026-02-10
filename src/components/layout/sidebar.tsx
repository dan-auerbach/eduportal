"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { NavCounts } from "@/hooks/use-nav-counts";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Award,
  Users,
  FolderOpen,
  BarChart3,
  Settings,
  FileText,
  AlertTriangle,
  Building2,
  Hash,
  Star,
  Radio,
  Radar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; labelKey: string; icon: LucideIcon; ownerOnly?: boolean };

const employeeNav: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/modules", labelKey: "nav.modules", icon: BookOpen },
  { href: "/certificates", labelKey: "nav.certificates", icon: Award },
  { href: "/chat", labelKey: "nav.chat", icon: Hash },
  { href: "/mentor-v-zivo", labelKey: "nav.mentorLive", icon: Radio },
  { href: "/radar", labelKey: "nav.radar", icon: Radar },
];

const adminNav: NavItem[] = [
  { href: "/admin", labelKey: "nav.overview", icon: LayoutDashboard },
  { href: "/admin/modules", labelKey: "nav.modules", icon: BookOpen },
  { href: "/admin/users", labelKey: "nav.users", icon: Users },
  { href: "/admin/groups", labelKey: "nav.groups", icon: FolderOpen },
  { href: "/admin/progress", labelKey: "nav.progress", icon: BarChart3 },
  { href: "/admin/late-users", labelKey: "nav.lateUsers", icon: AlertTriangle },
  { href: "/admin/feedback", labelKey: "nav.feedback", icon: Star },
  { href: "/admin/audit-log", labelKey: "nav.auditLog", icon: FileText, ownerOnly: true },
  { href: "/admin/settings", labelKey: "nav.settings", icon: Settings },
];

const ownerNav: NavItem[] = [
  { href: "/owner", labelKey: "nav.tenants", icon: Building2 },
];

// ── Sidebar ──────────────────────────────────────────────────────────────────

type SidebarProps = {
  tenantId?: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  onNavigate?: () => void;
  nextLiveEvent?: { title: string; startsAt: string } | null;
  navCounts?: NavCounts;
};

/**
 * SidebarContent — shared nav content used in both desktop sidebar and mobile drawer.
 * Badge counts come from `navCounts` prop (single /api/nav-counts poll in AppShell).
 */
export function SidebarContent({ tenantName, tenantLogoUrl, onNavigate, nextLiveEvent, navCounts }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isOwner = role === "OWNER";

  const isInAdminSection = pathname.startsWith("/admin");
  const isInOwnerSection = pathname.startsWith("/owner");
  const isOnChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  const isOnRadarPage = pathname === "/radar" || pathname.startsWith("/radar");

  const rawNavItems = isInOwnerSection && isOwner
    ? ownerNav
    : isInAdminSection && (isAdmin || isOwner)
      ? adminNav
      : employeeNav;

  const navItems = rawNavItems.filter((item) => !item.ownerOnly || isOwner);

  // Badge counts from centralized nav-counts (suppress when on the relevant page)
  const chatUnread = isOnChatPage ? 0 : (navCounts?.chatUnread ?? 0);
  const radarUnread = isOnRadarPage ? 0 : (navCounts?.radarUnread ?? 0);

  return (
    <>
      {/* Logo + tenant — click navigates to dashboard */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex h-14 items-center gap-2 border-b px-4 hover:bg-muted/50 transition-colors"
      >
        {tenantLogoUrl ? (
          <img src={tenantLogoUrl} alt={tenantName || "Logo"} className="h-9 w-auto max-w-[180px] rounded object-contain" />
        ) : (
          <>
            <GraduationCap className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold truncate">{tenantName || t("nav.appName")}</span>
          </>
        )}
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
          const isRadarItem = item.href === "/radar";
          const badgeCount = isChatItem ? chatUnread : isRadarItem ? radarUnread : 0;
          const showBadge = badgeCount > 0;
          const isMentorLive = item.href === "/mentor-v-zivo";

          // Build sub-label for #mentor v živo
          let liveSubLabel: string | null = null;
          if (isMentorLive) {
            if (nextLiveEvent) {
              const d = new Date(nextLiveEvent.startsAt);
              const now = new Date();
              const isToday = d.toDateString() === now.toDateString();
              const dayStr = isToday
                ? t("mentorLive.today")
                : d.toLocaleDateString(undefined, { weekday: "short" });
              const timeStr = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
              const title = nextLiveEvent.title.length > 20
                ? nextLiveEvent.title.slice(0, 20) + "…"
                : nextLiveEvent.title;
              liveSubLabel = `${dayStr} ${timeStr} — ${title}`;
            } else {
              liveSubLabel = t("nav.mentorLiveNoEvents");
            }
          }

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
              <item.icon className={cn("h-4 w-4 shrink-0", isMentorLive && isActive && "animate-pulse")} style={isMentorLive && isActive ? { animationDuration: "3s" } : undefined} />
              <div className="flex-1 min-w-0">
                <span>{t(item.labelKey)}</span>
                {liveSubLabel && (
                  <span className="block text-[10px] leading-tight text-muted-foreground truncate mt-0.5">
                    {liveSubLabel}
                  </span>
                )}
              </div>
              {showBadge && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Logo at bottom */}
      <div className="border-t px-4 py-4 flex justify-center">
        <Image
          src="/logo.png"
          alt="Mentor"
          width={160}
          height={53}
          className="h-10 w-auto opacity-70"
        />
      </div>
    </>
  );
}

/**
 * Desktop sidebar — hidden on mobile, shown on md+
 */
export function Sidebar({ tenantId, tenantName, tenantLogoUrl, nextLiveEvent, navCounts }: SidebarProps) {
  return (
    <aside className="hidden md:flex h-full w-64 flex-col border-r bg-card">
      <SidebarContent tenantId={tenantId} tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} nextLiveEvent={nextLiveEvent} navCounts={navCounts} />
    </aside>
  );
}
