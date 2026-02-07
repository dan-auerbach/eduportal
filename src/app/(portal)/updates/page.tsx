import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { AddUpdateForm } from "./add-update-form";
import { DeleteUpdateButton } from "./delete-update-button";

export default async function UpdatesPage() {
  const ctx = await getTenantContext();
  const isOwner = ctx.user.role === "OWNER";

  const entries = await prisma.changelogEntry.findMany({
    where: { tenantId: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      version: true,
      title: true,
      summary: true,
      isCurrent: true,
      createdAt: true,
    },
  });

  const currentEntry = entries.find((e) => e.isCurrent);
  const previousEntries = entries.filter((e) => !e.isCurrent);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("updates.title")}</h1>
        <p className="text-muted-foreground">{t("updates.subtitle")}</p>
      </div>

      {/* Owner: add update form */}
      {isOwner && <AddUpdateForm />}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">{t("updates.noUpdates")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Current version */}
          {currentEntry && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t("updates.currentVersion")}
              </h2>
              <div className="rounded-lg border-2 border-primary/20 bg-primary/[0.02] p-4">
                <div className="flex items-start gap-3">
                  <Badge className="shrink-0 mt-0.5">{t("updates.currentVersion")}</Badge>
                  <p className="text-sm flex-1">
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      {format(new Date(currentEntry.createdAt), "yyyy-MM-dd HH:mm", { locale: getDateLocale() })}
                    </span>
                    <span className="font-semibold mr-1">{currentEntry.version}</span>
                    <span className="text-muted-foreground mx-1">—</span>
                    <span className="font-medium mr-1">{currentEntry.title}</span>
                    <span className="text-muted-foreground mx-1">—</span>
                    <span>{currentEntry.summary}</span>
                  </p>
                  {isOwner && <DeleteUpdateButton entryId={currentEntry.id} />}
                </div>
              </div>
            </div>
          )}

          {/* Previous updates */}
          {previousEntries.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {t("updates.previousUpdates")}
              </h2>
              <div className="space-y-1">
                {previousEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border px-4 py-3 text-sm flex items-start gap-3"
                  >
                    <p className="flex-1">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {format(new Date(entry.createdAt), "yyyy-MM-dd HH:mm", { locale: getDateLocale() })}
                      </span>
                      <span className="font-semibold mr-1">{entry.version}</span>
                      <span className="text-muted-foreground mx-1">—</span>
                      <span className="font-medium mr-1">{entry.title}</span>
                      <span className="text-muted-foreground mx-1">—</span>
                      <span className="text-muted-foreground">{entry.summary}</span>
                    </p>
                    {isOwner && <DeleteUpdateButton entryId={entry.id} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
