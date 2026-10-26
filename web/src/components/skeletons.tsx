/** Skeleton fallbacks for Suspense boundaries — latency masking, not
 *  data-size masking: the shell paints instantly, sections fill in as
 *  their queries resolve. */

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-surface ${className}`} aria-hidden="true" />;
}

export function SkeletonFilters() {
  return (
    <search aria-hidden="true">
      <div className="bg-surface rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div className="grid gap-1">
          <Pulse className="h-5 w-16" />
          <Pulse className="h-11 w-full" />
        </div>
        <div className="grid gap-1">
          <Pulse className="h-5 w-14" />
          <Pulse className="h-11 w-36" />
        </div>
        <div className="grid gap-1">
          <Pulse className="h-5 w-16" />
          <Pulse className="h-11 w-36" />
        </div>
        <Pulse className="h-11 w-24" />
      </div>
    </search>
  );
}

export function SkeletonResults({ count = 6 }: { count?: number }) {
  return (
    <div>
      <Pulse className="h-6 w-64 mb-4" />
      <ul className="list-none p-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="bg-surface-raise rounded-lg border border-surface p-5">
            <Pulse className="h-6 w-3/4 mb-3" />
            <Pulse className="h-6 w-24 mb-4 rounded-full" />
            <Pulse className="h-4 w-full mb-2" />
            <Pulse className="h-4 w-5/6" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SkeletonTopics() {
  return (
    <ul className="list-none p-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="bg-surface rounded-lg p-5">
          <Pulse className="h-6 w-40 mb-2" />
          <Pulse className="h-4 w-full mb-2" />
          <Pulse className="h-4 w-2/3" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonDetail() {
  return (
    <div aria-hidden="true">
      <section className="bg-brand-primary">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 grid gap-3">
          <Pulse className="h-5 w-32 bg-white/20" />
          <Pulse className="h-10 w-2/3 bg-white/20" />
          <Pulse className="h-7 w-48 rounded-full bg-brand-accent/40" />
        </div>
      </section>
      <div className="mx-auto w-full max-w-4xl px-4 py-8 grid gap-8">
        <div className="grid gap-2">
          <Pulse className="h-4 w-full" />
          <Pulse className="h-4 w-11/12" />
          <Pulse className="h-4 w-4/5" />
        </div>
        <Pulse className="h-28 w-full" />
        <Pulse className="h-40 w-full" />
      </div>
    </div>
  );
}

export function SkeletonMeetings({ count = 6 }: { count?: number }) {
  return (
    <div>
      <Pulse className="h-6 w-56 mb-4" />
      <ul className="list-none p-0 grid gap-3" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="bg-surface-raise rounded-lg border border-surface p-4">
            <Pulse className="h-6 w-2/3 mb-2" />
            <Pulse className="h-4 w-40 mb-3" />
            <Pulse className="h-4 w-56" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SkeletonMap({
  className = "h-[70vh] min-h-[420px] w-full",
}: {
  className?: string;
}) {
  return (
    <div aria-hidden="true">
      <Pulse className={`${className} rounded-lg border border-surface`} />
    </div>
  );
}
