import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n";
import { getLeaderboard } from "@/actions/xp";
import { getMyXpBalance } from "@/actions/xp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RankBadge } from "@/components/gamification/rank-badge";
import { XpDisplay } from "@/components/gamification/xp-display";
import { Trophy, Medal, Zap } from "lucide-react";
import { LeaderboardFilters } from "./filters";

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const ctx = await getTenantContext();
  const params = await searchParams;
  const groupId = params.group || undefined;

  const [leaderboardResult, balanceResult, groups] = await Promise.all([
    getLeaderboard(groupId),
    getMyXpBalance(),
    prisma.group.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const entries = leaderboardResult.success ? leaderboardResult.data! : [];
  const myBalance = balanceResult.success ? balanceResult.data! : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("gamification.leaderboard")}</h1>
        <p className="text-muted-foreground">{t("gamification.leaderboardSubtitle")}</p>
      </div>

      {/* My XP */}
      {myBalance && (
        <Card>
          <CardContent className="py-4">
            <XpDisplay
              totalXp={myBalance.totalXp}
              rank={myBalance.rank}
              nextRank={myBalance.nextRank}
              variant="full"
            />
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <LeaderboardFilters groups={groups} currentGroup={groupId ?? ""} />

      {/* Leaderboard */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Trophy className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="font-medium">{t("gamification.noEntries")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isCurrentUser = entry.userId === ctx.user.id;
            const initials = `${entry.firstName[0] ?? ""}${entry.lastName[0] ?? ""}`.toUpperCase();

            return (
              <Card
                key={entry.userId}
                className={isCurrentUser ? "border-primary/50 bg-primary/5" : ""}
              >
                <CardContent className="flex items-center gap-4 py-3">
                  {/* Position */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                    {entry.position <= 3 ? (
                      <Medal
                        className={
                          entry.position === 1
                            ? "h-6 w-6 text-yellow-500"
                            : entry.position === 2
                              ? "h-6 w-6 text-slate-400"
                              : "h-6 w-6 text-amber-600"
                        }
                      />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground tabular-nums">
                        #{entry.position}
                      </span>
                    )}
                  </div>

                  {/* Avatar + Name */}
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {entry.firstName} {entry.lastName}
                      {isCurrentUser && (
                        <span className="ml-1.5 text-xs text-muted-foreground">({t("gamification.you")})</span>
                      )}
                    </p>
                    <RankBadge rank={entry.rank} size="sm" />
                  </div>

                  {/* XP */}
                  <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    {entry.totalXp.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
