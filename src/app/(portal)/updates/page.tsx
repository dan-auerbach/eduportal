import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { Card, CardContent } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { AddUpdateForm } from "./add-update-form";
import { UpdatesList, type DayGroup, type UpdateEntry } from "./updates-list";

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

  // Group entries by local date
  const dateLocale = getDateLocale();
  const groupMap = new Map<string, DayGroup>();

  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const dateKey = format(d, "yyyy-MM-dd", { locale: dateLocale });

    if (!groupMap.has(dateKey)) {
      groupMap.set(dateKey, {
        date: dateKey,
        formattedDate: format(d, "d. MMMM yyyy", { locale: dateLocale }),
        entries: [],
        hasCurrentEntry: false,
      });
    }

    const group = groupMap.get(dateKey)!;

    const item: UpdateEntry = {
      id: entry.id,
      version: entry.version,
      title: entry.title,
      summary: entry.summary,
      isCurrent: entry.isCurrent,
      time: format(d, "HH:mm", { locale: dateLocale }),
    };

    group.entries.push(item);

    if (entry.isCurrent) {
      group.hasCurrentEntry = true;
    }
  }

  const groups = Array.from(groupMap.values());

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
        <UpdatesList groups={groups} isOwner={isOwner} />
      )}
    </div>
  );
}
