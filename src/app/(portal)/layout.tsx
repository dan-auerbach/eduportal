import { AppShell } from "@/components/layout/app-shell";
import { LocaleProvider } from "@/components/locale-provider";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { setLocale } from "@/lib/i18n";
import { redirect } from "next/navigation";
import { getNextLiveEvent } from "@/actions/live-events";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let tenantContext;
  try {
    tenantContext = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      if (e.code === "TENANT_PICKER_REQUIRED") {
        redirect("/select-tenant");
      }
      if (e.code === "NO_MEMBERSHIP" || e.code === "NO_TENANTS") {
        redirect("/auth/login");
      }
    }
    redirect("/auth/login");
  }

  // Set locale for server-side t() calls in this request
  setLocale(tenantContext.tenantLocale);

  const themeClass = tenantContext.tenantTheme !== "DEFAULT"
    ? `theme-${tenantContext.tenantTheme.toLowerCase()}`
    : "";

  // Fetch next live event for sidebar sub-label
  const nextLiveEvent = await getNextLiveEvent(tenantContext.tenantId);

  return (
    <div className={themeClass}>
      <LocaleProvider locale={tenantContext.tenantLocale}>
        <AppShell
          tenantId={tenantContext.tenantId}
          tenantName={tenantContext.tenantName}
          tenantLogoUrl={tenantContext.tenantLogoUrl}
          tenantTheme={tenantContext.tenantTheme}
          effectiveRole={tenantContext.effectiveRole}
          isOwnerImpersonating={tenantContext.isOwnerImpersonating}
          nextLiveEvent={nextLiveEvent}
        >
          {children}
        </AppShell>
      </LocaleProvider>
    </div>
  );
}
