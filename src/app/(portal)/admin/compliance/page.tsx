import { t } from "@/lib/i18n";
import { getComplianceOverview } from "@/actions/compliance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { ReassignButton } from "./reassign-button";

export default async function CompliancePage() {
  const result = await getComplianceOverview();

  if (!result.success) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("compliance.title")}</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>{result.error ?? t("common.error")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { expiring, expired } = result.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("compliance.title")}</h1>
        <p className="text-muted-foreground">{t("compliance.subtitle")}</p>
      </div>

      {/* KPI summary */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("compliance.expiringCount")}
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{expiring.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("compliance.expiredCount")}
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{expired.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expiring soon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-5 w-5 text-amber-500" />
            {t("compliance.expiringSoon")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expiring.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("compliance.noExpiring")}
            </p>
          ) : (
            <div className="space-y-2">
              {expiring.map((item) => (
                <div
                  key={`${item.userId}-${item.moduleId}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.moduleTitle}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {item.daysRemaining} {t("compliance.daysLeft")}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expired */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            {t("compliance.expired")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {expired.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t("compliance.noExpired")}
            </p>
          ) : (
            <div className="space-y-2">
              {expired.map((item) => (
                <div
                  key={`${item.userId}-${item.moduleId}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.moduleTitle} &middot;{" "}
                      {t("compliance.expiredDaysAgo", {
                        days: Math.abs(item.daysRemaining).toString(),
                      })}
                    </p>
                  </div>
                  <ReassignButton
                    userId={item.userId}
                    moduleId={item.moduleId}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
