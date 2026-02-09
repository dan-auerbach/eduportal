"use client";

import { useState } from "react";
import {
  ExternalLink,
  Pin,
  Bookmark,
  Archive,
  Check,
  PinOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { t } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import type { RadarPostDTO } from "@/actions/radar";
import { RejectRadarDialog } from "@/components/radar/radar-admin-actions";
import { useRadarAction } from "@/components/radar/use-radar-action";
import {
  approveRadarPost,
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

/** Relative time using date-fns with Slovenian locale — "pred 15 minutami" */
function relativeTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), {
    addSuffix: true,
    locale: getDateLocale(),
  });
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
      className={`rounded p-1 text-muted-foreground/50 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-30 transition-colors ${className}`}
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
  /** Use createdAt instead of approvedAt for relative time (for "My posts" / pending) */
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
  const approve = useRadarAction(
    () => approveRadarPost(post.id),
    t("radar.postApproved"),
  );
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
    "",
  );

  return (
    <div className="group/item relative py-2.5 px-1 hover:bg-muted/20 focus-within:bg-muted/20 transition-colors">
      {/* Layout: content left + actions right */}
      <div className="flex gap-2 min-w-0">
        {/* ── Left: content column ── */}
        <div className="flex-1 min-w-0">
          {/* Row A: Description (main hook) — with inline indicators */}
          {post.description ? (
            <div>
              <p
                className={`text-[13px] leading-snug text-foreground/90 font-medium whitespace-pre-line ${
                  !expanded ? "line-clamp-3 sm:line-clamp-2" : ""
                }`}
              >
                {/* Pinned indicator inline */}
                {post.pinned && (
                  <Pin className="inline h-3 w-3 text-amber-500 -rotate-45 mr-1 -mt-0.5" />
                )}
                {/* NEW dot inline */}
                {fresh && !post.pinned && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full bg-primary mr-1.5 -mt-0.5 align-middle"
                    title={t("radar.newBadge")}
                  />
                )}
                {post.description}
              </p>
              {post.description.length > 80 && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  className="text-primary/60 hover:text-primary text-[11px] hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {expanded ? t("radar.showLess") : t("radar.showMore")}
                </button>
              )}
            </div>
          ) : (
            /* No description — show URL as primary with indicators */
            <div className="flex items-center gap-1.5 min-w-0">
              {post.pinned && (
                <Pin className="h-3 w-3 text-amber-500 shrink-0 -rotate-45" />
              )}
              {fresh && !post.pinned && (
                <span
                  className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
                  title={t("radar.newBadge")}
                />
              )}
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                title={post.url}
                className="text-[13px] font-medium text-foreground/90 hover:text-primary transition-colors truncate"
              >
                {post.sourceDomain}
              </a>
            </div>
          )}

          {/* Row B: Full URL (secondary, code-like, single-line ellipsis) */}
          {post.description && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              title={post.url}
              className="mt-0.5 block truncate text-[11px] font-mono text-muted-foreground/50 hover:text-primary/70 transition-colors max-w-full sm:max-w-[680px]"
            >
              {post.url}
            </a>
          )}

          {/* Row C: Meta — author · relative time + optional status badge */}
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/50 min-w-0">
            {authorName && (
              <span className="truncate max-w-[120px]">{authorName}</span>
            )}
            {authorName && <span className="shrink-0">·</span>}
            <span className="shrink-0">{relativeTime(timeSource)}</span>
            {showStatus && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-4 leading-none shrink-0 ml-1 ${STATUS_COLORS[post.status] || ""}`}
              >
                {t(`radar.status${post.status.charAt(0)}${post.status.slice(1).toLowerCase()}`)}
              </Badge>
            )}
          </div>

          {/* Reject reason */}
          {post.rejectReason && (
            <p className="mt-0.5 text-[11px] text-red-500/70">
              {t("radar.rejectedReason", { reason: post.rejectReason })}
            </p>
          )}
        </div>

        {/* ── Right: action icons column ── */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
          {/* External link — always visible */}
          <IconBtn
            onClick={() =>
              window.open(post.url, "_blank", "noopener,noreferrer")
            }
            title={t("radar.openLink")}
            className="!text-muted-foreground/40 hover:!text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </IconBtn>

          {/* Secondary actions — hover on desktop, always on mobile */}
          <div className="flex flex-col items-center gap-0.5 md:opacity-0 md:group-hover/item:opacity-100 md:group-focus-within/item:opacity-100 transition-opacity">
            {/* Bookmark (all users, approved) */}
            {post.status === "APPROVED" && (
              <IconBtn
                onClick={saveToggle.execute}
                disabled={saveToggle.pending}
                title={post.saved ? t("radar.unsave") : t("radar.save")}
              >
                <Bookmark
                  className={`h-3.5 w-3.5 ${post.saved ? "fill-primary text-primary" : ""}`}
                />
              </IconBtn>
            )}

            {/* Admin: pin/unpin (approved) */}
            {isAdmin && post.status === "APPROVED" && (
              <IconBtn
                onClick={pinToggle.execute}
                disabled={pinToggle.pending}
                title={post.pinned ? t("radar.unpin") : t("radar.pin")}
              >
                {post.pinned ? (
                  <PinOff className="h-3.5 w-3.5" />
                ) : (
                  <Pin className="h-3.5 w-3.5" />
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
                <Archive className="h-3.5 w-3.5" />
              </IconBtn>
            )}

            {/* Admin: approve (pending) */}
            {isAdmin && post.status === "PENDING" && (
              <IconBtn
                onClick={approve.execute}
                disabled={approve.pending}
                title={t("radar.approve")}
                className="hover:!text-green-600 focus-visible:!text-green-600"
              >
                <Check className="h-3.5 w-3.5" />
              </IconBtn>
            )}

            {/* Admin: reject (pending) */}
            {isAdmin && post.status === "PENDING" && (
              <RejectRadarDialog postId={post.id} iconOnly />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
