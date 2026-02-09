import Link from "next/link";
import { Pin, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/i18n";
import type { RadarPostDTO } from "@/actions/radar";

const TAG_COLORS: Record<string, string> = {
  AI: "bg-purple-100 text-purple-800 border-purple-200",
  TECH: "bg-blue-100 text-blue-800 border-blue-200",
  PRODUCTIVITY: "bg-green-100 text-green-800 border-green-200",
  MEDIA: "bg-orange-100 text-orange-800 border-orange-200",
  SECURITY: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  ARCHIVED: "bg-gray-100 text-gray-800 border-gray-200",
};

function isStale(approvedAt: string | null): boolean {
  if (!approvedAt) return false;
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  return new Date(approvedAt) < sixtyDaysAgo;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RadarPostCard({
  post,
  showStatus = false,
}: {
  post: RadarPostDTO;
  showStatus?: boolean;
}) {
  const stale = post.status === "APPROVED" && isStale(post.approvedAt);
  const authorName = post.createdBy
    ? `${post.createdBy.firstName} ${post.createdBy.lastName}`
    : "—";

  return (
    <Link
      href={`/radar/${post.id}`}
      className="block group"
    >
      <div
        className={`rounded-xl border border-border/40 bg-card p-4 transition-all hover:shadow-md hover:border-primary/20 ${
          stale ? "opacity-70" : ""
        }`}
      >
        {/* Header: badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Badge
            variant="outline"
            className="bg-primary/10 text-primary border-primary/20 text-[10px] px-1.5"
          >
            {t("radar.radarTag")}
          </Badge>
          {post.pinned && (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5"
            >
              <Pin className="mr-0.5 h-3 w-3" />
              {t("radar.pinnedBadge")}
            </Badge>
          )}
          {post.tag && (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 ${TAG_COLORS[post.tag] || ""}`}
            >
              {t(`radar.tag${post.tag}`)}
            </Badge>
          )}
          {stale && (
            <Badge
              variant="outline"
              className="bg-gray-100 text-gray-500 border-gray-200 text-[10px] px-1.5"
            >
              {t("radar.staleBadge")}
            </Badge>
          )}
          {showStatus && (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 ${STATUS_COLORS[post.status] || ""}`}
            >
              {t(`radar.status${post.status.charAt(0)}${post.status.slice(1).toLowerCase()}`)}
            </Badge>
          )}
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {post.title}
        </h3>

        {/* Description */}
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {post.description}
        </p>

        {/* Footer: source domain, author, date */}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground/60">
            <ExternalLink className="h-3 w-3" />
            {post.sourceDomain}
          </span>
          <span>·</span>
          <span>{authorName}</span>
          <span>·</span>
          <span>{formatDate(post.approvedAt || post.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
