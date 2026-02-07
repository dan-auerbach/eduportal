import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { SelectTenantButton } from "./select-tenant-button";

export default async function SelectTenantPage() {
  const user = await getCurrentUser();

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: {
      tenant: true,
    },
    orderBy: { tenant: { name: "asc" } },
  });

  // Filter out archived tenants
  const activeMemberships = memberships.filter((m) => !m.tenant.archivedAt);

  // Auto-select if only 1 membership
  if (activeMemberships.length === 1) {
    redirect("/dashboard");
  }

  // No memberships
  if (activeMemberships.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
            <CardTitle>Niste član nobenega podjetja</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              Obrnite se na skrbnika za dodajanje v podjetje.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multiple memberships — show picker
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-2xl px-4">
        <div className="text-center mb-8">
          <Building2 className="mx-auto h-12 w-12 text-primary mb-4" />
          <h1 className="text-2xl font-bold">Izberite podjetje</h1>
          <p className="text-muted-foreground mt-1">
            {"Član ste več podjetij. Izberite, v katero želite vstopiti."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {activeMemberships.map((membership) => (
            <Card key={membership.id} className="hover:border-primary transition-colors">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{membership.tenant.name}</CardTitle>
                <p className="text-xs text-muted-foreground">/{membership.tenant.slug}</p>
              </CardHeader>
              <CardContent>
                <SelectTenantButton tenantId={membership.tenantId} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
