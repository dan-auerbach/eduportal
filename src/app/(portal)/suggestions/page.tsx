import { t } from "@/lib/i18n";
import { getSuggestions } from "@/actions/suggestions";
import { Card, CardContent } from "@/components/ui/card";
import { SuggestionCard } from "@/components/suggestions/suggestion-card";
import { Lightbulb } from "lucide-react";
import { SuggestionComposer } from "./composer";
import { SuggestionTabs } from "./tabs";
import type { SuggestionStatus } from "@/generated/prisma/client";

export default async function SuggestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; status?: string }>;
}) {
  const params = await searchParams;
  const sort = (params.sort as "popular" | "newest") || "popular";
  const status = (params.status as SuggestionStatus) || undefined;

  const result = await getSuggestions(sort, status);
  const suggestions = result.success ? result.data! : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("suggestions.title")}</h1>
        <p className="text-muted-foreground">{t("suggestions.subtitle")}</p>
      </div>

      {/* Composer */}
      <SuggestionComposer />

      {/* Sort/Filter tabs */}
      <SuggestionTabs currentSort={sort} currentStatus={status} />

      {/* Feed */}
      {suggestions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Lightbulb className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">{t("suggestions.noSuggestions")}</p>
            <p className="mt-1 text-sm">{t("suggestions.beFirst")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              id={s.id}
              title={s.title}
              description={s.description}
              link={s.link}
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
  );
}
