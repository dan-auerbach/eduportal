"use client";

import { useState } from "react";
import {
  ExternalLink,
  Pin,
  Archive,
  PinOff,
  Link as LinkIcon,
  Bookmark,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { t } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import type { RadarPostDTO } from "@/actions/radar";
import { useRadarAction } from "@/components/radar/use-radar-action";
import {
  archiveRadarPost,
  pinRadarPost,
  unpinRadarPost,
  toggleRadarSave,
} from "@/actions/radar";

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 border-yellow-200",
  APPROVED: "bg-green-100 text-green-800 border-green-200",
  REJECTED: "bg-red-100 text-red-800 border-red-200",
  ARCHIVED: "bg-gray-100 text-gray-800 border-gray-200",
};

function isNew(approvedAt: string | null): boolean {
  if (!approvedAt) return false;
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return new Date(approvedAt) > twoDaysAgo;
}

/** Relative time using date-fns with locale */
function relativeTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), {
    addSuffix: true,
    locale: getDateLocale(),
  });
}

/** Only open http/https URLs */
function safeOpen(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    // invalid URL — do nothing
  }
}

// ── Tiny icon button (accessible) ───────────────────────────────────────────

function IconBtn({
  onClick,
  disabled,
  title,
  children,
  className = "",
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

// ── Main feed item ──────────────────────────────────────────────────────────

export function RadarFeedItem({
  post,
  showStatus = false,
  isAdmin = false,
  useCreatedAt = false,
}: {
  post: RadarPostDTO;
  showStatus?: boolean;
  isAdmin?: boolean;
  /** Use createdAt instead of approvedAt for relative time (for "My posts") */
  useCreatedAt?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fresh = post.status === "APPROVED" && isNew(post.approvedAt);
  const authorName = post.createdBy
    ? `${post.createdBy.firstName} ${post.createdBy.lastName}`
    : "";

  // Pick the right timestamp for relative time display
  const timeSource = useCreatedAt
    ? post.createdAt
    : post.approvedAt || post.createdAt;

  // Action hooks
  const archive = useRadarAction(
    () => archiveRadarPost(post.id),
    t("radar.postArchived"),
  );
  const pinToggle = useRadarAction(
    () => (post.pinned ? unpinRadarPost(post.id) : pinRadarPost(post.id)),
    post.pinned ? t("radar.postUnpinned") : t("radar.postPinned"),
  );
  const saveToggle = useRadarAction(
    () => toggleRadarSave(post.id),
    post.saved ? t("radar.postUnpinned") : t("radar.postPinnedPersonal"),
  );

  /** Click on container opens the link */
  function handleItemClick() {
    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) return;
    safeOpen(post.url);
  }

  return (
    <div
      className="group/item relative rounded-lg border border-border/50 bg-card p-4 hover:border-border hover:shadow-sm transition-all cursor-pointer"
      onClick={handleItemClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
          safeOpen(post.url);
        }
      }}
    >
      {/* Layout: content left + actions right */}
      <div className="flex gap-3 min-w-0">
        {/* ── Left: content column ── */}
        <div className="flex-1 min-w-0">
          {/* Row A: Description / headline — with inline indicators */}
          {post.description ? (
            <div>
              <p
                className={`text-[15px] leading-relaxed text-foreground font-medium whitespace-pre-line ${
                  !expanded ? "line-clamp-3 sm:line-clamp-2" : ""
                }`}
              >
                {/* Personal pin indicator */}
                {post.saved && (
                  <Bookmark className="inline h-4 w-4 fill-primary text-primary mr-1.5 -mt-0.5" />
                )}
                {/* Global pinned indicator */}
                {post.pinned && !post.saved && (
                  <Pin className="inline h-4 w-4 text-amber-500 -rotate-45 mr-1.5 -mt-0.5" />
                )}
                {/* NEW dot inline */}
                {fresh && !post.pinned && !post.saved && (
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-primary mr-1.5 -mt-0.5 align-middle"
                    title={t("radar.newBadge")}
                  />
                )}
                {post.description}
              </p>
              {post.description.length > 80 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(!expanded);
                  }}
                  className="text-primary/70 hover:text-primary text-xs mt-0.5 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {expanded ? t("radar.showLess") : t("radar.showMore")}
                </button>
              )}
            </div>
          ) : (
            /* No description — show domain as primary with indicators */
            <div className="flex items-center gap-2 min-w-0">
              {post.saved && (
                <Bookmark className="h-4 w-4 fill-primary text-primary shrink-0" />
              )}
              {post.pinned && !post.saved && (
                <Pin className="h-4 w-4 text-amber-500 shrink-0 -rotate-45" />
              )}
              {fresh && !post.pinned && !post.saved && (
                <span
                  className="h-2 w-2 rounded-full bg-primary shrink-0"
                  title={t("radar.newBadge")}
                />
              )}
              <span className="text-[15px] font-medium text-foreground truncate">
                {post.sourceDomain}
              </span>
            </div>
          )}

          {/* Row B: Full URL with link icon */}
          <div
            className="mt-1.5 flex items-center gap-1.5 min-w-0 max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <LinkIcon className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              title={post.url}
              className="truncate text-xs font-mono text-muted-foreground/60 hover:text-primary transition-colors"
            >
              {post.url}
            </a>
          </div>

          {/* Row C: Meta — author · relative time + optional status badge */}
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground min-w-0">
            {authorName && (
              <span className="truncate max-w-[160px] font-medium">{authorName}</span>
            )}
            {authorName && <span className="shrink-0 text-muted-foreground/40">·</span>}
            <span className="shrink-0">{relativeTime(timeSource)}</span>
            {showStatus && (
              <Badge
                variant="outline"
                className={`text-[11px] px-1.5 py-0 h-5 leading-none shrink-0 ml-1 ${STATUS_COLORS[post.status] || ""}`}
              >
                {t(`radar.status${post.status.charAt(0)}${post.status.slice(1).toLowerCase()}`)}
              </Badge>
            )}
          </div>

          {/* Reject reason */}
          {post.rejectReason && (
            <p className="mt-1 text-xs text-red-500/80">
              {t("radar.rejectedReason", { reason: post.rejectReason })}
            </p>
          )}
        </div>

        {/* ── Right: action icons column ── */}
        <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
          {/* External link */}
          <IconBtn
            onClick={() => safeOpen(post.url)}
            title={t("radar.openLink")}
            className="!text-muted-foreground/40 group-hover/item:!text-muted-foreground hover:!text-primary"
          >
            <ExternalLink className="h-4 w-4" />
          </IconBtn>

          {/* Secondary actions — hover on desktop, always on mobile */}
          <div className="flex flex-col items-center gap-1 md:opacity-0 md:group-hover/item:opacity-100 md:group-focus-within/item:opacity-100 transition-opacity">
            {/* Personal bookmark (all users, approved posts) */}
            {post.status === "APPROVED" && (
              <IconBtn
                onClick={saveToggle.execute}
                disabled={saveToggle.pending}
                title={post.saved ? t("radar.unpinPersonal") : t("radar.pinPersonal")}
              >
                <Bookmark
                  className={`h-4 w-4 ${post.saved ? "fill-primary text-primary" : ""}`}
                />
              </IconBtn>
            )}

            {/* Admin: global pin/unpin (approved) */}
            {isAdmin && post.status === "APPROVED" && (
              <IconBtn
                onClick={pinToggle.execute}
                disabled={pinToggle.pending}
                title={post.pinned ? t("radar.unpin") : t("radar.pin")}
              >
                {post.pinned ? (
                  <PinOff className="h-4 w-4" />
                ) : (
                  <Pin className="h-4 w-4 text-amber-500/70" />
                )}
              </IconBtn>
            )}

            {/* Admin: archive (approved) */}
            {isAdmin && post.status === "APPROVED" && (
              <IconBtn
                onClick={archive.execute}
                disabled={archive.pending}
                title={t("radar.archive")}
              >
                <Archive className="h-4 w-4" />
              </IconBtn>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
