"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Clock,
  CheckCircle2,
  Pin,
  AlertTriangle,
  BookOpen,
  BarChart3,
  Zap,
  ArrowRight,
  GraduationCap,
  MessageSquare,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { toggleUserPin } from "@/actions/pinning";
import { toast } from "sonner";

export type ModuleCardProps = {
  id: string;
  title: string;
  description: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  estimatedTime: number | null;
  coverImage: string | null;
  isMandatory: boolean;
  tags: string[];
  progress: {
    percentage: number;
    status: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_QUIZ" | "COMPLETED";
    completedSections: number;
    totalSections: number;
    totalSteps: number;
    completedSteps: number;
  };
  deadline?: Date | null;
  allQuizzesPassed?: boolean;
  needsReview?: boolean;
  isUserPinned?: boolean;
  isCompanyPinned?: boolean;
  categoryName?: string | null;
  assignmentGroups?: string[];
  mentors?: { id: string; firstName: string; lastName: string; avatar: string | null }[];
  recentChatActivity?: boolean;
};

// Deterministic gradient based on module id — 6 curated gradients
const GRADIENTS = [
  "from-primary/80 via-primary/60 to-primary/40",
  "from-teal-600/80 via-teal-500/60 to-emerald-400/40",
  "from-violet-600/80 via-purple-500/60 to-indigo-400/40",
  "from-rose-600/80 via-pink-500/60 to-orange-400/40",
  "from-blue-600/80 via-sky-500/60 to-cyan-400/40",
  "from-amber-600/80 via-orange-500/60 to-yellow-400/40",
];

const GRADIENT_ICONS = [BookOpen, BarChart3, Zap, BookOpen, BarChart3, Zap];

function getGradientIndex(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % GRADIENTS.length;
}

// Circular progress ring — clean SVG, no shadow
function CircularProgress({ percentage, size = 40, stroke = 3.5 }: { percentage: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        className="text-muted/60"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cn(
          "transition-all duration-500",
          percentage === 0
            ? "text-muted-foreground/20"
            : percentage === 100
              ? "text-emerald-500"
              : "text-primary"
        )}
      />
    </svg>
  );
}

export function ModuleCard({ module }: { module: ModuleCardProps }) {
  const [isPinned, setIsPinned] = useState(module.isUserPinned ?? false);
  const [isPending, startTransition] = useTransition();

  const isCompleted = module.progress.status === "COMPLETED";
  const isInProgress = module.progress.status === "IN_PROGRESS";
  const isNotStarted = module.progress.status === "NOT_STARTED";
  const quizRequired = module.progress.status === "READY_FOR_QUIZ";

  // Deadline logic
  let deadlineUrgency: "normal" | "soon" | "overdue" = "normal";
  if (module.deadline && !isCompleted) {
    const daysUntil = differenceInDays(new Date(module.deadline), new Date());
    if (daysUntil < 0) deadlineUrgency = "overdue";
    else if (daysUntil < 3) deadlineUrgency = "soon";
  }

  // CTA config
  const ctaLabel = isNotStarted
    ? t("modules.ctaStart")
    : isInProgress
      ? t("modules.ctaContinue")
      : quizRequired
        ? t("modules.ctaQuiz")
        : t("modules.ctaView");

  const gradientIdx = getGradientIndex(module.id);
  const GradientIcon = GRADIENT_ICONS[gradientIdx];

  function handlePinToggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const result = await toggleUserPin(module.id);
      if (result.success) {
        setIsPinned(result.data.pinned);
        toast.success(result.data.pinned ? t("modules.modulePinned") : t("modules.moduleUnpinned"));
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Link href={`/modules/${module.id}`} className="group block h-full">
      <div
        className={cn(
          "h-full flex flex-col rounded-xl border overflow-hidden transition-all duration-200",
          "bg-card text-card-foreground",
          "hover:shadow-lg hover:-translate-y-0.5",
          "border-border/50",
          isCompleted && "opacity-80 hover:opacity-100"
        )}
      >
        {/* ─── Cover image / Gradient header ─── */}
        <div className="relative aspect-[16/9] overflow-hidden">
          {module.coverImage ? (
            <Image
              src={module.coverImage}
              alt={module.title}
              fill
              loading="lazy"
              unoptimized={module.coverImage.startsWith("/api/")}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          ) : (
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br",
                GRADIENTS[gradientIdx]
              )}
            >
              {/* Decorative pattern */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 right-4 w-24 h-24 rounded-full border-2 border-white/40" />
                <div className="absolute bottom-3 left-3 w-16 h-16 rounded-full border-2 border-white/30" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <GradientIcon className="h-16 w-16 text-white/50" strokeWidth={1} />
                </div>
              </div>
            </div>
          )}

          {/* Subtle overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

          {/* Top-left badges on cover */}
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
            {module.isMandatory && (
              <Badge className="bg-white/90 text-foreground border-0 backdrop-blur-sm text-[11px] font-medium shadow-sm">
                {t("common.mandatory")}
              </Badge>
            )}
            {module.needsReview && (
              <Badge className="bg-blue-500/90 text-white border-0 backdrop-blur-sm text-[11px] font-medium shadow-sm">
                {t("modules.updated")}
              </Badge>
            )}
            {deadlineUrgency === "overdue" && (
              <Badge className="bg-red-500/90 text-white border-0 backdrop-blur-sm text-[11px] font-medium shadow-sm">
                <AlertTriangle className="h-3 w-3 mr-0.5" />
                {t("modules.deadline", { date: format(module.deadline!, "d. MMM", { locale: getDateLocale() }) })}
              </Badge>
            )}
            {deadlineUrgency === "soon" && (
              <Badge className="bg-amber-500/90 text-white border-0 backdrop-blur-sm text-[11px] font-medium shadow-sm">
                <Clock className="h-3 w-3 mr-0.5" />
                {t("modules.deadlineDaysRemaining", { days: differenceInDays(new Date(module.deadline!), new Date()) })}
              </Badge>
            )}
          </div>

          {/* Pin toggle — top right on cover */}
          <button
            type="button"
            onClick={handlePinToggle}
            disabled={isPending}
            className={cn(
              "absolute top-3 right-3 z-10 p-1.5 rounded-full transition-all backdrop-blur-sm",
              isPinned || module.isCompanyPinned
                ? "bg-white/90 text-primary shadow-sm"
                : "bg-white/0 text-white/70 hover:bg-white/80 hover:text-primary opacity-0 group-hover:opacity-100"
            )}
            title={isPinned ? t("modules.unpinModule") : t("modules.pinModule")}
          >
            {isPinned || module.isCompanyPinned ? (
              <Pin className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Pin className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Bottom-right: difficulty pill on cover */}
          <div className="absolute bottom-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[11px] font-medium text-white">
              {module.estimatedTime && (
                <>
                  <Clock className="h-3 w-3" />
                  {module.estimatedTime} {t("common.min")}
                  <span className="mx-0.5 opacity-50">·</span>
                </>
              )}
              {t(`difficulty.${module.difficulty}`)}
            </span>
          </div>
        </div>

        {/* ─── Body: Title + Description ─── */}
        <div className="px-4 pt-4 pb-0 space-y-1.5 flex-1">
          <h3 className="font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors text-[15px]">
            {module.title}
          </h3>
          <p className="text-[13px] text-muted-foreground line-clamp-2 leading-relaxed">
            {module.description}
          </p>

          {/* Category + tags row */}
          {(module.categoryName || module.tags.length > 0) && (
            <div className="flex items-center gap-1.5 pt-1">
              {module.categoryName && (
                <span className="text-[11px] text-muted-foreground/70 bg-muted/60 rounded-full px-2 py-0.5">
                  {module.categoryName}
                </span>
              )}
              {module.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="text-[11px] text-muted-foreground/60 bg-muted/40 rounded-full px-2 py-0.5">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Assignment reason */}
          {module.assignmentGroups && module.assignmentGroups.length > 0 && (
            <p className="text-[11px] text-muted-foreground/70 truncate pt-0.5" title={module.assignmentGroups.join(", ")}>
              {t("modules.assignedBecause", {
                groups: module.assignmentGroups.length <= 2
                  ? module.assignmentGroups.join(", ")
                  : `${module.assignmentGroups.slice(0, 2).join(", ")} ${t("modules.andMore", { count: String(module.assignmentGroups.length - 2) })}`
              })}
            </p>
          )}

          {/* Mentors */}
          {module.mentors && module.mentors.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70 pt-0.5" title={module.mentors.map((m) => `${m.firstName} ${m.lastName}`).join(", ")}>
              <GraduationCap className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {module.mentors.length === 1 ? t("sectionViewer.mentor") : t("sectionViewer.mentors")}:{" "}
                {module.mentors.length <= 2
                  ? module.mentors.map((m) => `${m.firstName} ${m.lastName}`).join(", ")
                  : `${module.mentors.slice(0, 2).map((m) => `${m.firstName} ${m.lastName}`).join(", ")} ${t("modules.andMore", { count: String(module.mentors.length - 2) })}`}
              </span>
            </div>
          )}

          {/* Quiz required notice */}
          {quizRequired && (
            <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 rounded-md px-2.5 py-1.5 mt-2">
              {t("modules.quizRequiredShort")}
            </p>
          )}
        </div>

        {/* ─── Footer: Progress + CTA ─── */}
        <div className="px-4 pb-4 pt-3 mt-auto">
          <div className="flex items-center justify-between">
            {/* Left: progress indicator */}
            <div className="flex items-center gap-2.5">
              {isCompleted ? (
                <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-xs font-medium">{t("progressStatus.COMPLETED")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CircularProgress percentage={module.progress.percentage} />
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{module.progress.percentage}%</span>
                    <span className="mx-1">·</span>
                    <span>{module.progress.completedSteps}/{module.progress.totalSteps}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: CTA + chat indicator */}
            <div className="flex items-center gap-2">
              {module.recentChatActivity && (
                <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground" title={t("moduleChat.recentActivity")}>
                  <MessageSquare className="h-3 w-3" />
                </span>
              )}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium transition-colors",
                  isCompleted
                    ? "text-muted-foreground group-hover:text-foreground"
                    : quizRequired
                      ? "text-amber-600 dark:text-amber-400 group-hover:text-amber-700"
                      : "text-primary group-hover:text-primary/80"
                )}
              >
                {ctaLabel}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>

          {/* Deadline (for non-urgent, non-completed) */}
          {module.deadline && !isCompleted && deadlineUrgency === "normal" && (
            <p className="text-[11px] text-muted-foreground mt-2">
              {t("modules.deadline", { date: format(module.deadline, "d. MMM yyyy", { locale: getDateLocale() }) })}
            </p>
          )}

          {/* Company pinned badge */}
          {module.isCompanyPinned && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-primary/70 font-medium">
                <Pin className="h-3 w-3 fill-current" />
                {t("modules.pinnedBadge")}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
