import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { t } from "@/lib/i18n";
import { TenantCreateForm } from "./tenant-create-form";

export default async function NewTenantPage() {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/owner">
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t("common.previous")}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{t("tenant.createTenant")}</h1>
          <p className="text-muted-foreground">{t("tenant.createSubtitle")}</p>
        </div>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>{t("tenant.createTenant")}</CardTitle>
          <CardDescription>{t("tenant.createSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <TenantCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
