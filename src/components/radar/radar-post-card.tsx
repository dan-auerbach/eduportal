"use client";

import { useState } from "react";
import { Pin, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import type { RadarPostDTO } from "@/actions/radar";
import {
  ApproveRadarButton,
  RejectRadarDialog,
  ArchiveRadarButton,
  PinRadarToggle,
  SaveRadarToggle,
} from "@/components/radar/radar-admin-actions";

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

const DESC_CLAMP = 120; // characters before truncating

export function RadarPostCard({
  post,
  showStatus = false,
  isAdmin = false,
}: {
  post: RadarPostDTO;
  showStatus?: boolean;
  isAdmin?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const stale = post.status === "APPROVED" && isStale(post.approvedAt);
  const authorName = post.createdBy
    ? `${post.createdBy.firstName} ${post.createdBy.lastName}`
    : "";
  const longDesc = post.description.length > DESC_CLAMP;

  return (
    <div
      className={`rounded-xl border border-border/40 bg-card p-4 transition-all ${
        stale ? "opacity-70" : ""
      }`}
    >
      {/* Header row: sourceDomain + badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-primary transition-colors min-w-0"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{post.sourceDomain}</span>
        </a>
        <div className="flex flex-wrap items-center gap-1 shrink-0">
          {post.pinned && (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5"
            >
              <Pin className="mr-0.5 h-3 w-3" />
              {t("radar.pinnedBadge")}
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
      </div>

      {/* Description with expand/collapse */}
      <div className="text-xs text-muted-foreground leading-relaxed">
        <p className="whitespace-pre-line">
          {expanded || !longDesc
            ? post.description
            : post.description.slice(0, DESC_CLAMP) + "..."}
        </p>
        {longDesc && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-0.5 text-primary text-[11px] font-medium mt-1 hover:underline"
          >
            {expanded ? (
              <>
                {t("radar.showLess")}
                <ChevronUp className="h-3 w-3" />
              </>
            ) : (
              <>
                {t("radar.showMore")}
                <ChevronDown className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Footer: author, date, actions */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground min-w-0">
          {authorName && <span className="truncate">{authorName}</span>}
          {authorName && <span>·</span>}
          <span className="shrink-0">{formatDate(post.approvedAt || post.createdAt)}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Save toggle for all users on approved posts */}
          {post.status === "APPROVED" && (
            <SaveRadarToggle postId={post.id} saved={post.saved} />
          )}
          {/* Open external link */}
          <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {/* Reject reason */}
      {post.rejectReason && (
        <p className="mt-2 text-[11px] text-red-600">
          {t("radar.rejectedReason", { reason: post.rejectReason })}
        </p>
      )}

      {/* Inline admin actions */}
      {isAdmin && (
        <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5">
          {post.status === "PENDING" && (
            <>
              <ApproveRadarButton postId={post.id} />
              <RejectRadarDialog postId={post.id} />
            </>
          )}
          {post.status === "APPROVED" && (
            <>
              <PinRadarToggle postId={post.id} pinned={post.pinned} />
              <ArchiveRadarButton postId={post.id} />
            </>
          )}
          {post.status !== "ARCHIVED" &&
            post.status !== "PENDING" &&
            post.status !== "APPROVED" && (
              <ArchiveRadarButton postId={post.id} />
            )}
        </div>
      )}
    </div>
  );
}
