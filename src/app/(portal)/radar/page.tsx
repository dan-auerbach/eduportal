import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { Radar } from "lucide-react";
import {
  getApprovedRadarPosts,
  getMyRadarPosts,
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
      : await getApprovedRadarPosts();

  const posts = result.success ? result.data : [];

  // Empty state messages per tab
  const emptyMessage =
    tab === "my"
      ? t("radar.noMyPosts")
      : t("radar.noApprovedPosts");

  const emptyDesc =
    tab === "approved" ? t("radar.noApprovedPostsDesc") : undefined;

  return (
    <div className="max-w-3xl">
      {/* Mark radar as seen for unread counter */}
      <MarkRadarSeen />

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Radar className="h-6 w-6 text-primary shrink-0" />
        <div>
          <h1 className="text-2xl font-bold">{t("radar.title")}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("radar.subtitle")}
          </p>
        </div>
      </div>

      {/* Inline composer — always visible on approved tab */}
      {tab === "approved" && (
        <div className="mb-6">
          <RadarComposer />
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4">
        <RadarTabs />
      </div>

      {/* Feed */}
      {posts.length > 0 ? (
        <div className="space-y-2">
          {posts.map((post) => (
            <RadarFeedItem
              key={post.id}
              post={post}
              showStatus={tab === "my"}
              isAdmin={isAdmin}
              useCreatedAt={tab === "my"}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Radar className="h-12 w-12 text-muted-foreground/20 mb-4" />
          <p className="text-base font-medium text-muted-foreground">
            {emptyMessage}
          </p>
          {emptyDesc && (
            <p className="text-sm text-muted-foreground/60 mt-1">
              {emptyDesc}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
