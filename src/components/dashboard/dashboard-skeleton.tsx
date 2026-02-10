import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton fallback for the deferred dashboard content.
 * Shown while <DashboardContent> streams its heavy DB queries.
 * Mirrors the real layout: hero CTA → stats row → module grid.
 */
export function DashboardSkeleton() {
  return (
    <>
      {/* Hero CTA skeleton */}
      <div className="rounded-2xl bg-primary/10 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-1.5 w-32 mt-2" />
            </div>
          </div>
          <Skeleton className="h-11 w-36 rounded-md shrink-0" />
        </div>
      </div>

      {/* Stats row skeleton */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Progress card */}
        <div className="sm:col-span-2 rounded-xl border border-border/40 bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-10" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="flex gap-5 mt-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>

        {/* Certificates card */}
        <div className="rounded-xl border border-border/40 bg-card p-5 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-8" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>

      {/* Module grid skeleton */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/40 bg-card overflow-hidden">
              {/* Cover image area */}
              <Skeleton className="h-32 w-full rounded-none" />
              <div className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <div className="flex items-center gap-2 pt-1">
                  <Skeleton className="h-2 flex-1 rounded-full" />
                  <Skeleton className="h-3 w-8" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
