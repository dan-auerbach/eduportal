"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ArrowRight,
  GraduationCap,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import type { ModuleCardProps } from "./module-card";

export function CompletedModuleCard({ module }: { module: ModuleCardProps }) {
  return (
    <Link href={`/modules/${module.id}`} className="group block">
      <div
        className={cn(
          "flex flex-col rounded-lg border px-4 py-3 transition-all duration-200",
          "bg-muted/30 text-card-foreground",
          "hover:bg-muted/60 hover:shadow-sm",
          "border-border/40"
        )}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {module.title}
            </h3>
          </div>
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
            {t("modules.ctaView")}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-1.5 ml-6 flex-wrap">
          {/* Difficulty + time */}
          <span className="text-[11px] text-muted-foreground/70">
            {t(`difficulty.${module.difficulty}`)}
            {module.estimatedTime && (
              <>
                {" "}&middot;{" "}{module.estimatedTime} {t("common.min")}
              </>
            )}
          </span>

          {/* Category */}
          {module.categoryName && (
            <span className="text-[11px] text-muted-foreground/60 bg-muted/60 rounded-full px-1.5 py-0.5">
              {module.categoryName}
            </span>
          )}

          {/* Mandatory badge (muted on completed) */}
          {module.isMandatory && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground/70 border-muted-foreground/20">
              {t("common.mandatory")}
            </Badge>
          )}
        </div>

        {/* Mentors */}
        {module.mentors && module.mentors.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 mt-1.5 ml-6">
            <GraduationCap className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {module.mentors.slice(0, 2).map((m) => `${m.firstName} ${m.lastName}`).join(", ")}
              {module.mentors.length > 2 && ` ${t("modules.andMore", { count: String(module.mentors.length - 2) })}`}
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
