import { redirect } from "next/navigation";
import { t } from "@/lib/i18n";
import { getTenantContext } from "@/lib/tenant";
import { getSuggestions } from "@/actions/suggestions";
import { Card, CardContent } from "@/components/ui/card";
import { SuggestionCard } from "@/components/suggestions/suggestion-card";
import { Lightbulb, Flame, Sparkles } from "lucide-react";
import { SuggestionComposer } from "./composer";
import { SuggestionTabs } from "./tabs";
import type { SuggestionStatus } from "@/generated/prisma/client";

export default async function SuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; status?: string }>;
}) {
  const ctx = await getTenantContext();
  if (!ctx.config.features.suggestions) redirect("/dashboard");

  const params = await searchParams;
  const sort = (params.sort as "popular" | "newest") || "popular";
  const status = (params.status as SuggestionStatus) || undefined;

  const result = await getSuggestions(sort, status);
  const suggestions = result.success ? result.data! : [];

  return (
    <div className="mx-auto max-w-4xl px-2 py-6 sm:px-6 sm:py-8">
      {/* Hero section */}
      <Card className="overflow-hidden border-amber-200/60 bg-gradient-to-br from-amber-50 to-orange-50/50 dark:border-amber-900/30 dark:from-amber-950/20 dark:to-orange-950/10">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-6 w-6 text-amber-500" />
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {t("suggestions.heroTitle")}
              </h1>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {t("suggestions.heroSubtitle")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-center rounded-2xl bg-white/80 px-6 py-4 shadow-sm dark:bg-card/80">
            <Sparkles className="mb-1 h-5 w-5 text-amber-500" />
            <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">+10 XP</span>
            <span className="text-xs text-muted-foreground">{t("suggestions.heroXpLabel")}</span>
            <span className="mt-2 flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Flame className="h-3 w-3" />
              {t("suggestions.heroXpBonus")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Composer */}
      <div className="mt-6">
        <SuggestionComposer />
      </div>

      {/* Sort/Filter tabs */}
      <div className="mt-6">
        <SuggestionTabs currentSort={sort} currentStatus={status} />
      </div>

      {/* Feed */}
      <div className="mt-4">
        {suggestions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Lightbulb className="mx-auto mb-3 h-10 w-10 text-amber-400 opacity-60" />
              <p className="font-medium">{t("suggestions.noSuggestions")}</p>
              <p className="mt-1 text-sm">{t("suggestions.beFirst")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                id={s.id}
                title={s.title}
                authorName={s.authorName}
                status={s.status}
                voteCount={s.voteCount}
                commentCount={s.commentCount}
                hasVoted={s.hasVoted}
                createdAt={s.createdAt}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
