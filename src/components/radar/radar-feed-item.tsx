"use client";

import { useState } from "react";
import {
  ExternalLink,
  Pin,
  Archive,
  PinOff,
  Bookmark,
  MoreHorizontal,
  Copy,
  Globe,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { t } from "@/lib/i18n";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RadarPostDTO } from "@/actions/radar";
import { useRadarAction } from "@/components/radar/use-radar-action";
import {
  archiveRadarPost,
  pinRadarPost,
  unpinRadarPost,
  toggleRadarSave,
} from "@/actions/radar";

function isNew(approvedAt: string | null): boolean {
  if (!approvedAt) return false;
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return new Date(approvedAt) > twoDaysAgo;
}

function relativeTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), {
    addSuffix: true,
    locale: getDateLocale(),
  });
}

function safeOpen(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    // invalid URL
  }
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

// ── Main feed item (X-style) ────────────────────────────────────────────────

export function RadarFeedItem({
  post,
  showStatus = false,
  isAdmin = false,
  useCreatedAt = false,
}: {
  post: RadarPostDTO;
  showStatus?: boolean;
  isAdmin?: boolean;
  useCreatedAt?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fresh = post.status === "APPROVED" && isNew(post.approvedAt);
  const author = post.createdBy;
  const authorName = author
    ? `${author.firstName} ${author.lastName}`
    : "";

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
    post.saved ? t("radar.postUnsaved") : t("radar.postSaved"),
  );

  function handleCopyLink() {
    navigator.clipboard.writeText(post.url).then(() => {
      toast.success(t("radar.linkCopied"));
    });
  }

  return (
    <article className="flex gap-3 px-1 py-3">
      {/* Avatar */}
      <div className="shrink-0 pt-0.5">
        <Avatar size="sm">
          <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
            {author ? getInitials(author.firstName, author.lastName) : "?"}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: name · time · indicators */}
        <div className="flex items-center gap-1.5 text-sm min-w-0">
          {authorName && (
            <span className="font-semibold truncate max-w-[180px]">{authorName}</span>
          )}
          <span className="text-muted-foreground/40 shrink-0">·</span>
          <span className="text-muted-foreground text-xs shrink-0">{relativeTime(timeSource)}</span>
          {post.pinned && (
            <Pin className="h-3 w-3 text-amber-500 -rotate-45 shrink-0" />
          )}
          {fresh && !post.pinned && (
            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          )}
          {showStatus && (
            <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
              post.status === "APPROVED" ? "bg-green-100 text-green-700" :
              post.status === "PENDING" ? "bg-yellow-100 text-yellow-700" :
              post.status === "REJECTED" ? "bg-red-100 text-red-700" :
              "bg-muted text-muted-foreground"
            }`}>
              {t(`radar.status${post.status.charAt(0)}${post.status.slice(1).toLowerCase()}`)}
            </span>
          )}
        </div>

        {/* Description */}
        {post.description && (
          <div className="mt-1">
            <p
              className={`text-[15px] leading-relaxed whitespace-pre-line ${
                !expanded ? "line-clamp-3" : ""
              }`}
            >
              {post.description}
            </p>
            {post.description.length > 120 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-primary text-xs mt-0.5 hover:underline"
              >
                {expanded ? t("radar.showLess") : t("radar.showMore")}
              </button>
            )}
          </div>
        )}

        {/* Link preview card (MVP: favicon + domain + full url) */}
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mt-2 flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 hover:bg-muted/50 transition-colors group/link"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${post.sourceDomain}&sz=32`}
            alt=""
            className="h-4 w-4 shrink-0 rounded-sm"
            loading="lazy"
          />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-foreground">{post.sourceDomain}</span>
            <p className="text-xs text-muted-foreground truncate">{post.url}</p>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover/link:text-muted-foreground shrink-0" />
        </a>

        {/* Reject reason */}
        {post.rejectReason && (
          <p className="mt-1.5 text-xs text-red-500/80">
            {t("radar.rejectedReason", { reason: post.rejectReason })}
          </p>
        )}

        {/* Actions row (horizontal, compact) */}
        {post.status === "APPROVED" && (
          <div className="flex items-center gap-1 mt-2 -ml-2">
            {/* Bookmark / Save */}
            <button
              type="button"
              onClick={saveToggle.execute}
              disabled={saveToggle.pending}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors ${
                post.saved
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              title={post.saved ? t("radar.unsave") : t("radar.save")}
            >
              <Bookmark className={`h-3.5 w-3.5 ${post.saved ? "fill-primary" : ""}`} />
            </button>

            {/* Copy link */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t("radar.copyLink")}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>

            {/* Open link */}
            <button
              type="button"
              onClick={() => safeOpen(post.url)}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title={t("radar.openLink")}
            >
              <Globe className="h-3.5 w-3.5" />
            </button>

            {/* ⋯ More menu (admin actions) */}
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem
                    onClick={pinToggle.execute}
                    disabled={pinToggle.pending}
                  >
                    {post.pinned ? (
                      <>
                        <PinOff className="mr-2 h-3.5 w-3.5" />
                        {t("radar.unpin")}
                      </>
                    ) : (
                      <>
                        <Pin className="mr-2 h-3.5 w-3.5 text-amber-500" />
                        {t("radar.pin")}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={archive.execute}
                    disabled={archive.pending}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="mr-2 h-3.5 w-3.5" />
                    {t("radar.archive")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
