"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import {
  GraduationCap,
  LayoutDashboard,
  BookOpen,
  Award,
  Bell,
  User,
  Users,
  FolderOpen,
  BarChart3,
  Settings,
  FileText,
  AlertTriangle,
  Building2,
  Megaphone,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type NavItem = { href: string; labelKey: string; icon: LucideIcon; ownerOnly?: boolean };

const employeeNav: NavItem[] = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { href: "/modules", labelKey: "nav.modules", icon: BookOpen },
  { href: "/certificates", labelKey: "nav.certificates", icon: Award },
  { href: "/notifications", labelKey: "nav.notifications", icon: Bell },
  { href: "/updates", labelKey: "nav.updates", icon: Megaphone },
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
  { href: "/updates", labelKey: "nav.updates", icon: Megaphone },
  { href: "/admin/settings", labelKey: "nav.settings", icon: Settings },
];

const ownerNav: NavItem[] = [
  { href: "/owner", labelKey: "nav.tenants", icon: Building2 },
];

type SidebarProps = {
  tenantName?: string;
  tenantLogoUrl?: string | null;
  onNavigate?: () => void;
};

/**
 * SidebarContent — shared nav content used in both desktop sidebar and mobile drawer.
 */
export function SidebarContent({ tenantName, tenantLogoUrl, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "SUPER_ADMIN" || role === "ADMIN";
  const isOwner = role === "OWNER";

  const isInAdminSection = pathname.startsWith("/admin");
  const isInOwnerSection = pathname.startsWith("/owner");

  const rawNavItems = isInOwnerSection && isOwner
    ? ownerNav
    : isInAdminSection && (isAdmin || isOwner)
      ? adminNav
      : employeeNav;

  const navItems = rawNavItems.filter((item) => !item.ownerOnly || isOwner);

  return (
    <>
      {/* Logo + tenant */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        {tenantLogoUrl ? (
          <img src={tenantLogoUrl} alt={tenantName || "Logo"} width={24} height={24} className="h-6 w-6 rounded object-contain" />
        ) : (
          <GraduationCap className="h-6 w-6 text-primary" />
        )}
        <span className="text-lg font-semibold truncate">{tenantName || t("nav.appName")}</span>
      </div>

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
              {t(item.labelKey)}
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
export function Sidebar({ tenantName, tenantLogoUrl }: SidebarProps) {
  return (
    <aside className="hidden md:flex h-full w-64 flex-col border-r bg-card">
      <SidebarContent tenantName={tenantName} tenantLogoUrl={tenantLogoUrl} />
    </aside>
  );
}
