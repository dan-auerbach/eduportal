"use client";

import { cn } from "@/lib/utils";
import { GraduationCap, Wrench, Award, Star } from "lucide-react";
import type { ReputationRank } from "@/generated/prisma/client";

// ── Rank config ──────────────────────────────────────────────────────────────

const RANK_CONFIG: Record<
  ReputationRank,
  { label: string; icon: typeof Award; color: string; bgColor: string; borderColor: string }
> = {
  VAJENEC: {
    label: "Vajenec",
    icon: GraduationCap,
    color: "text-amber-700 dark:text-amber-500",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    borderColor: "border-amber-300 dark:border-amber-700",
  },
  POMOCNIK: {
    label: "Pomočnik",
    icon: Wrench,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/20",
    borderColor: "border-blue-300 dark:border-blue-600",
  },
  MOJSTER: {
    label: "Mojster",
    icon: Award,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    borderColor: "border-yellow-400 dark:border-yellow-600",
  },
  MENTOR: {
    label: "Mentor",
    icon: Star,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-400 dark:border-purple-600",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

type RankBadgeProps = {
  rank: ReputationRank;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: { icon: "h-3 w-3", text: "text-xs", padding: "px-1.5 py-0.5 gap-0.5" },
  md: { icon: "h-4 w-4", text: "text-sm", padding: "px-2 py-1 gap-1" },
  lg: { icon: "h-5 w-5", text: "text-base", padding: "px-3 py-1.5 gap-1.5" },
};

export function RankBadge({ rank, size = "md", showLabel = true, className }: RankBadgeProps) {
  const config = RANK_CONFIG[rank];
  const sizes = sizeClasses[size];
  const Icon = config.icon;

  return (
    <span
      data-slot="rank-badge"
      className={cn(
        "inline-flex items-center rounded-full border font-medium",
        config.color,
        config.bgColor,
        config.borderColor,
        sizes.padding,
        sizes.text,
        className,
      )}
    >
      <Icon className={sizes.icon} />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}

export { RANK_CONFIG };
