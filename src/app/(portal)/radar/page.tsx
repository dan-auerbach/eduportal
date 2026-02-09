import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { Radar } from "lucide-react";
import {
  getApprovedRadarPosts,
  getMyRadarPosts,
  getPendingRadarPosts,
} from "@/actions/radar";
import { CreateRadarPostDialog } from "@/components/radar/radar-post-form";
import { RadarPostCard } from "@/components/radar/radar-post-card";
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
    <div className="space-y-6">
      {/* Mark radar as seen for unread counter */}
      <MarkRadarSeen />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Radar className="h-6 w-6 text-primary" />
            {t("radar.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("radar.subtitle")}
          </p>
        </div>
        <CreateRadarPostDialog isAdmin={isAdmin} />
      </div>

      {/* Tabs */}
      <RadarTabs isAdmin={isAdmin} />

      {/* Posts list — single column, no grid */}
      {posts.length > 0 ? (
        <div className="space-y-3 max-w-2xl">
          {posts.map((post) => (
            <RadarPostCard
              key={post.id}
              post={post}
              showStatus={tab === "my"}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Radar className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm font-medium text-muted-foreground">
            {emptyMessage}
          </p>
          {emptyDesc && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              {emptyDesc}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
