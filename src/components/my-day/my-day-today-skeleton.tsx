import { Skeleton } from "@/components/ui/skeleton";

/** Real loading placeholder for My Day's Today tab — status-bucket row + task grid — while the
 * underlying task hook's `isLoading` is true. Shared by every role's My Day so the shape never
 * drifts between them (same convention as `StatCardSkeleton` on the Dashboard side). */
export function MyDayTodaySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your tasks…</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-8" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
