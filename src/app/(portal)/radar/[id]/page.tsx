import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Radar } from "lucide-react";
import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { getRadarPostById } from "@/actions/radar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ApproveRadarButton,
  RejectRadarDialog,
  ArchiveRadarButton,
  PinRadarToggle,
} from "@/components/radar/radar-admin-actions";

type Params = Promise<{ id: string }>;

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

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function RadarDetailPage({
  params,
}: {
  params: Params;
}) {
  const ctx = await getTenantContext();
  setLocale(ctx.tenantLocale);

  const { id } = await params;
  const result = await getRadarPostById(id);

  if (!result.success) {
    notFound();
  }

  const post = result.data;
  const authorName = post.createdBy
    ? `${post.createdBy.firstName} ${post.createdBy.lastName}`
    : "—";
  const approverName = post.approvedBy
    ? `${post.approvedBy.firstName} ${post.approvedBy.lastName}`
    : null;

  const isAdmin =
    ctx.effectiveRole === "ADMIN" ||
    ctx.effectiveRole === "SUPER_ADMIN" ||
    ctx.effectiveRole === "OWNER";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link
        href="/radar"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        {t("radar.backToList")}
      </Link>

      <Card>
        <CardContent className="pt-6 space-y-5">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="bg-primary/10 text-primary border-primary/20"
            >
              <Radar className="mr-1 h-3 w-3" />
              {t("radar.radarTag")}
            </Badge>
            <Badge
              variant="outline"
              className={STATUS_COLORS[post.status] || ""}
            >
              {t(`radar.status${post.status.charAt(0)}${post.status.slice(1).toLowerCase()}`)}
            </Badge>
            {post.pinned && (
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-700 border-amber-200"
              >
                {t("radar.pinnedBadge")}
              </Badge>
            )}
            {post.tag && (
              <Badge
                variant="outline"
                className={TAG_COLORS[post.tag] || ""}
              >
                {t(`radar.tag${post.tag}`)}
              </Badge>
            )}
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold leading-tight">{post.title}</h1>

          {/* Description */}
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {post.description}
          </p>

          {/* External link */}
          <div>
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex"
            >
              <Button>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("radar.openLink")}
              </Button>
            </a>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {post.sourceDomain}
            </p>
          </div>

          {/* Metadata */}
          <div className="border-t pt-4 space-y-1.5 text-xs text-muted-foreground">
            <p>{t("radar.submittedBy", { name: authorName })}</p>
            <p>{formatDate(post.createdAt)}</p>
            {approverName && post.approvedAt && (
              <p>
                {t("radar.approvedByLabel", { name: approverName })} ·{" "}
                {formatDate(post.approvedAt)}
              </p>
            )}
            {post.rejectReason && (
              <p className="text-red-600">
                {t("radar.rejectedReason", { reason: post.rejectReason })}
              </p>
            )}
          </div>

          {/* Admin actions */}
          {isAdmin && (
            <div className="border-t pt-4 flex flex-wrap gap-2">
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
              {post.status !== "ARCHIVED" && post.status !== "PENDING" && post.status !== "APPROVED" && (
                <ArchiveRadarButton postId={post.id} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
