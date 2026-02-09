"use client";

import { useState } from "react";
import {
  ExternalLink,
  Pin,
  Bookmark,
  Archive,
  Check,
  X,
  PinOff,
} from "lucide-react";
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

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "short",
  });
}

// ── Tiny icon button (accessible: focusable, has title) ─────────────────────

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
}: {
  post: RadarPostDTO;
  showStatus?: boolean;
  isAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fresh = post.status === "APPROVED" && isNew(post.approvedAt);
  const authorName = post.createdBy
    ? `${post.createdBy.firstName} ${post.createdBy.lastName}`
    : "";

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
    "", // toast handled by hook based on saved state
  );

  return (
    <div className="group/item relative py-2.5 px-1 focus-within:bg-muted/30 transition-colors">
      {/* Row 1: domain + actions */}
      <div className="flex items-center gap-1.5 min-w-0">
        {/* Pinned indicator */}
        {post.pinned && (
          <Pin className="h-3 w-3 text-amber-500 shrink-0 -rotate-45" />
        )}
        {/* NEW dot */}
        {fresh && !post.pinned && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
            title={t("radar.newBadge")}
          />
        )}

        {/* Domain link — ellipsis, max-width, full-URL tooltip */}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          title={post.url}
          className="text-[13px] font-semibold text-foreground hover:text-primary transition-colors truncate max-w-[180px] sm:max-w-[240px]"
        >
          {post.sourceDomain}
        </a>

        {/* Status badge ("My posts" tab) */}
        {showStatus && (
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 leading-none shrink-0 ${STATUS_COLORS[post.status] || ""}`}
          >
            {t(`radar.status${post.status.charAt(0)}${post.status.slice(1).toLowerCase()}`)}
          </Badge>
        )}

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* External link — always visible (primary CTA) */}
        <IconBtn
          onClick={() =>
            window.open(post.url, "_blank", "noopener,noreferrer")
          }
          title={t("radar.openLink")}
          className="!text-muted-foreground/40 hover:!text-primary shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </IconBtn>

        {/* Secondary actions — hover-reveal on desktop, always visible on mobile */}
        <div className="flex items-center shrink-0 md:opacity-0 md:group-hover/item:opacity-100 md:group-focus-within/item:opacity-100 transition-opacity">
          {/* Bookmark (all users, approved posts) */}
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

          {/* Admin: reject (pending) — dialog */}
          {isAdmin && post.status === "PENDING" && (
            <RejectRadarDialog postId={post.id} iconOnly />
          )}
        </div>
      </div>

      {/* Row 2: description — CSS line-clamp (2 desktop, 3 mobile) */}
      {post.description && (
        <div className="mt-0.5">
          <p
            className={`text-[13px] leading-snug text-muted-foreground whitespace-pre-line ${
              !expanded ? "line-clamp-3 sm:line-clamp-2" : ""
            }`}
          >
            {post.description}
          </p>
          {/* Show toggle only if description is potentially long enough to clamp */}
          {post.description.length > 80 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-primary/60 hover:text-primary text-[12px] font-medium hover:underline focus-visible:underline focus-visible:outline-none mt-0.5"
            >
              {expanded ? t("radar.showLess") : t("radar.showMore")}
            </button>
          )}
        </div>
      )}

      {/* Row 3: meta */}
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
        {authorName && <span>{authorName}</span>}
        {authorName && <span>·</span>}
        <span>{formatDate(post.approvedAt || post.createdAt)}</span>
      </div>

      {/* Reject reason */}
      {post.rejectReason && (
        <p className="mt-1 text-[11px] text-red-500/70">
          {t("radar.rejectedReason", { reason: post.rejectReason })}
        </p>
      )}
    </div>
  );
}
