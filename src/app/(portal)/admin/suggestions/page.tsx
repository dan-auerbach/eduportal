import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { getTenantContext } from "@/lib/tenant";
import { getSuggestions } from "@/actions/suggestions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lightbulb, ThumbsUp, MessageSquare } from "lucide-react";
import { AdminSuggestionActions } from "./actions";
import Link from "next/link";
import type { SuggestionStatus } from "@/generated/prisma/client";

const STATUS_CONFIG: Record<SuggestionStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  OPEN: { label: "Odprto", variant: "secondary" },
  APPROVED: { label: "Odobreno", variant: "default" },
  REJECTED: { label: "Zavrnjeno", variant: "destructive" },
  CONVERTED: { label: "Pretvorjeno", variant: "outline" },
};

export default async function AdminSuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx.config.features.suggestions) redirect("/admin");

  const params = await searchParams;
  const statusFilter = params.status as SuggestionStatus | undefined;

  const result = await getSuggestions("newest", statusFilter);
  const suggestions = result.success ? result.data! : [];

  const statuses: (SuggestionStatus | "ALL")[] = ["ALL", "OPEN", "APPROVED", "REJECTED", "CONVERTED"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("suggestions.adminTitle")}</h1>
        <p className="text-muted-foreground">{t("suggestions.adminSubtitle")}</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {statuses.map((s) => {
          const isActive = s === "ALL" ? !statusFilter : statusFilter === s;
          const href = s === "ALL" ? "/admin/suggestions" : `/admin/suggestions?status=${s}`;
          const label = s === "ALL" ? t("common.all") : STATUS_CONFIG[s].label;

          return (
            <Link
              key={s}
              href={href}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Suggestions list */}
      {suggestions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Lightbulb className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">{t("suggestions.noSuggestions")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const statusConf = STATUS_CONFIG[s.status];
            const date = new Date(s.createdAt);

            return (
              <Card key={s.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/suggestions/${s.id}`}
                        className="text-sm font-medium hover:underline truncate"
                      >
                        {s.title}
                      </Link>
                      <Badge variant={statusConf.variant} className="shrink-0 text-xs">
                        {statusConf.label}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{s.authorName ?? "Anonimno"}</span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="h-3 w-3" />
                        {s.voteCount}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" />
                        {s.commentCount}
                      </span>
                      <time dateTime={s.createdAt}>
                        {date.toLocaleDateString("sl-SI", { day: "numeric", month: "short" })}
                      </time>
                    </div>
                  </div>
                  <AdminSuggestionActions
                    suggestionId={s.id}
                    currentStatus={s.status}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
