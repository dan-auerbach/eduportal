import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { Radar } from "lucide-react";
import {
  getApprovedRadarPosts,
  getSavedRadarPosts,
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
  if (!ctx.config.features.radar) redirect("/dashboard");
  setLocale(ctx.tenantLocale);

  const params = await searchParams;
  const tab = params.tab === "saved" ? "saved" : "all";

  const isAdmin =
    ctx.effectiveRole === "ADMIN" ||
    ctx.effectiveRole === "SUPER_ADMIN" ||
    ctx.effectiveRole === "OWNER";

  // Fetch data based on active tab
  const result =
    tab === "saved"
      ? await getSavedRadarPosts()
      : await getApprovedRadarPosts();

  const posts = result.success ? result.data : [];

  // Empty state per tab
  const emptyMessage =
    tab === "saved"
      ? t("radar.noSavedPosts")
      : t("radar.noApprovedPosts");

  const emptyDesc =
    tab === "all" ? t("radar.noApprovedPostsDesc") : t("radar.noSavedPostsDesc");

  return (
    <div className="max-w-2xl">
      {/* Mark radar as seen for unread counter */}
      <MarkRadarSeen />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Radar className="h-5 w-5 text-primary shrink-0" />
        <h1 className="text-xl font-bold">{t("radar.title")}</h1>
      </div>

      {/* Composer — always visible on main feed */}
      {tab === "all" && <RadarComposer />}

      {/* Tabs */}
      <div className="mt-3">
        <RadarTabs />
      </div>

      {/* Feed */}
      {posts.length > 0 ? (
        <div className="divide-y divide-border">
          {posts.map((post) => (
            <RadarFeedItem
              key={post.id}
              post={post}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Radar className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {emptyMessage}
          </p>
          {emptyDesc && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              {emptyDesc}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
