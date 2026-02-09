import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { Radar } from "lucide-react";
import {
  getApprovedRadarPosts,
  getMyRadarPosts,
  getPendingRadarPosts,
} from "@/actions/radar";
import { RadarComposer } from "@/components/radar/radar-composer";
import { RadarFeedItem } from "@/components/radar/radar-feed-item";
import { RadarTabs } from "@/components/radar/radar-tabs";
import { MarkRadarSeen } from "@/components/radar/mark-radar-seen";

type SearchParams = Promise<{ tab?: string }>;

export default async function RadarPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getTenantContext();
  setLocale(ctx.tenantLocale);

  const params = await searchParams;
  const tab = params.tab || "approved";

  const isAdmin =
    ctx.effectiveRole === "ADMIN" ||
    ctx.effectiveRole === "SUPER_ADMIN" ||
    ctx.effectiveRole === "OWNER";

  // Fetch data based on active tab
  const result =
    tab === "my"
      ? await getMyRadarPosts()
      : tab === "pending" && isAdmin
        ? await getPendingRadarPosts()
        : await getApprovedRadarPosts();

  const posts = result.success ? result.data : [];

  // Empty state messages per tab
  const emptyMessage =
    tab === "my"
      ? t("radar.noMyPosts")
      : tab === "pending"
        ? t("radar.noPendingPosts")
        : t("radar.noApprovedPosts");

  const emptyDesc =
    tab === "approved" ? t("radar.noApprovedPostsDesc") : undefined;

  return (
    <div className="max-w-2xl">
      {/* Mark radar as seen for unread counter */}
      <MarkRadarSeen />

      {/* Compact header */}
      <div className="flex items-center gap-2 mb-4">
        <Radar className="h-5 w-5 text-primary shrink-0" />
        <h1 className="text-lg font-bold">{t("radar.title")}</h1>
        <span className="text-xs text-muted-foreground/60 hidden sm:inline">
          {t("radar.subtitle")}
        </span>
      </div>

      {/* Inline composer — always visible on approved tab */}
      {tab === "approved" && (
        <div className="mb-4">
          <RadarComposer isAdmin={isAdmin} />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-2">
        <RadarTabs isAdmin={isAdmin} />
      </div>

      {/* Feed */}
      {posts.length > 0 ? (
        <div className="divide-y divide-border/40">
          {posts.map((post) => (
            <RadarFeedItem
              key={post.id}
              post={post}
              showStatus={tab === "my"}
              isAdmin={isAdmin}
              useCreatedAt={tab === "my" || tab === "pending"}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radar className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">
            {emptyMessage}
          </p>
          {emptyDesc && (
            <p className="text-xs text-muted-foreground/50 mt-1">
              {emptyDesc}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
