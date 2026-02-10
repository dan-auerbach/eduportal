"use client";

import { useState } from "react";
import { Sidebar, SidebarContent } from "./sidebar";
import { Header } from "./header";
import { ImpersonationBanner } from "./impersonation-banner";
import { UsageTracker } from "./usage-tracker";
import { useNavCounts } from "@/hooks/use-nav-counts";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

type AppShellProps = {
  children: React.ReactNode;
  tenantId?: string;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  tenantTheme?: string;
  effectiveRole?: string;
  isOwnerImpersonating?: boolean;
  nextLiveEvent?: { title: string; startsAt: string } | null;
};

export function AppShell({
  children,
  tenantId,
  tenantName,
  tenantLogoUrl,
  tenantTheme,
  effectiveRole,
  isOwnerImpersonating,
  nextLiveEvent,
}: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Single source of truth for all nav badge counts (one request, 60s poll)
  const navCounts = useNavCounts(tenantId);

  return (
    <div className="flex h-dvh">
      {/* Desktop sidebar */}
      <Sidebar
        tenantId={tenantId}
        tenantName={tenantName}
        tenantLogoUrl={tenantLogoUrl}
        nextLiveEvent={nextLiveEvent}
        navCounts={navCounts}
      />

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 [&>button]:hidden">
          <div className="flex h-full flex-col">
            <SidebarContent
              tenantId={tenantId}
              tenantName={tenantName}
              tenantLogoUrl={tenantLogoUrl}
              nextLiveEvent={nextLiveEvent}
              navCounts={navCounts}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Usage tracking (silent — renders nothing) */}
      <UsageTracker />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {isOwnerImpersonating && <ImpersonationBanner tenantName={tenantName || ""} />}
        <Header
          tenantLogoUrl={tenantLogoUrl}
          effectiveRole={effectiveRole}
          onMenuClick={() => setMobileOpen(true)}
          navCounts={navCounts}
        />
        <main className="flex-1 min-h-0 overflow-y-auto bg-muted/40 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
