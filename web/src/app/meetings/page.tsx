import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getMeetingFellowships,
  getMeetingTypeLabels,
  getPublishedMeetings,
} from "@/lib/db";
import { formatTime, todayWeekday, weekdayLabel, weeksLabel } from "@/lib/format";
import { SkeletonMeetings } from "@/components/skeletons";

export const metadata = {
  title: "Find a Meeting",
  description:
    "Mutual-aid meetings across Northeast Tennessee — AA, NA, Al-Anon, Celebrate Recovery, and more, with days and times.",
};

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function link(day: string, fellowship: string): string {
  const params = new URLSearchParams();
  if (day && day !== "all") params.set("day", day);
  if (fellowship) params.set("fellowship", fellowship);
  const qs = params.toString();
  return qs ? `/meetings?${qs}` : "/meetings";
}

export default async function MeetingsPage({
  searchParams,
}: PageProps<"/meetings">) {
  const sp = await searchParams;
  const today = todayWeekday();
  const rawDay = firstParam(sp.day).toLowerCase();
  const day = rawDay === "all" || WEEKDAYS.includes(rawDay as (typeof WEEKDAYS)[number])
    ? rawDay
    : today;
  const fellowship = firstParam(sp.fellowship);

  return (
    <div>
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
          <h1 className="font-headline font-bold text-3xl sm:text-4xl m-0">
            Find a meeting
          </h1>
          <p className="font-subhead text-lg text-white/90 mt-2 m-0">
            Mutual-aid meetings across ten Northeast Tennessee counties —
            showing {day === "all" ? "every day" : `${weekdayLabel(day)}s`} by
            default, or pick a day below.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-4 py-8">
        <nav aria-label="Filter by day" className="mb-3">
          <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
            <li>
              <Link
                href={link("all", fellowship)}
                aria-current={day === "all" ? "true" : undefined}
                className={day === "all" ? dayActiveClass : dayClass}
              >
                Any day
              </Link>
            </li>
            {WEEKDAYS.map((d) => (
              <li key={d}>
                <Link
                  href={link(d, fellowship)}
                  aria-current={day === d ? "true" : undefined}
                  className={day === d ? dayActiveClass : dayClass}
                >
                  {d === today ? `Today · ${weekdayLabel(d)}` : weekdayLabel(d).slice(0, 3)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Suspense
          key={`${day}|${fellowship}`}
          fallback={<SkeletonMeetings />}
        >
          <MeetingList day={day} fellowship={fellowship} />
        </Suspense>

        <p className="mt-10 text-base m-0">
          Looking for ongoing support rather than a meeting time?{" "}
          <Link
            href="/resources"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            Browse all resources
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

const dayClass =
  "flex items-center min-h-11 px-4 rounded-full border border-[#C9C9CE] bg-surface-raise text-base font-semibold text-text-body no-underline hover:border-brand-action";
const dayActiveClass =
  "flex items-center min-h-11 px-4 rounded-full bg-brand-primary text-white text-base font-semibold no-underline";

async function MeetingList({
  day,
  fellowship,
}: {
  day: string;
  fellowship: string;
}) {
  await connection();
  const [{ data: meetings, dbError }, fellowships, typeLabels] =
    await Promise.all([
      getPublishedMeetings({ day, fellowship }),
      getMeetingFellowships(),
      getMeetingTypeLabels(),
    ]);

  return (
    <div>
      {fellowships.length > 1 && (
        <nav aria-label="Filter by fellowship" className="mb-5">
          <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
            <li>
              <Link
                href={link(day, "")}
                aria-current={fellowship ? undefined : "true"}
                className={fellowship ? pillClass : pillActiveClass}
              >
                All fellowships
              </Link>
            </li>
            {fellowships.map((f) => (
              <li key={f}>
                <Link
                  href={link(day, f)}
                  aria-current={fellowship === f ? "true" : undefined}
                  className={fellowship === f ? pillActiveClass : pillClass}
                >
                  {f}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <p className="text-base text-text-body" role="status">
        {dbError
          ? "The meeting list is temporarily unavailable — please try again shortly."
          : `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"}${
              day === "all" ? " each week" : ` on ${weekdayLabel(day)}s`
            }${fellowship ? ` · ${fellowship}` : ""}`}
      </p>

      {meetings.length === 0 && !dbError ? (
        <div className="mt-4 bg-surface rounded-lg p-6">
          <p className="mt-0 mb-3">
            Nothing scheduled{day === "all" ? "" : ` on ${weekdayLabel(day)}s`}
            {fellowship ? ` for ${fellowship}` : ""}. Try another day — or{" "}
            <Link
              href={link("all", "")}
              className="text-brand-action font-semibold underline underline-offset-4"
            >
              show the whole week
            </Link>
            .
          </p>
        </div>
      ) : (
        <ul className="list-none p-0 mt-4 grid gap-3">
          {meetings.map((m) => (
            <li
              key={m.slug}
              className="bg-surface-raise rounded-lg border border-surface p-4"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-subhead font-bold text-lg text-brand-primary m-0">
                  {m.meeting_name}
                </h2>
                {m.fellowship && (
                  <span className="rounded-full bg-brand-primary text-white text-sm font-semibold px-3 py-0.5">
                    {m.fellowship}
                  </span>
                )}
              </div>
              {m.schedule.length > 0 && (
              <ul className="list-none p-0 m-0 mt-2 flex flex-wrap gap-x-5 gap-y-1">
                {[...m.schedule]
                  .sort((a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start))
                  .map((s, i) => (
                    <li key={i} className="text-base">
                      <span className="font-semibold">{weekdayLabel(s.day)}s</span>{" "}
                      {formatTime(s.start)}
                      {weeksLabel(s.weeks_of_month ?? null) && (
                        <span className="text-sm text-text-body/70">
                          {" "}
                          ({weeksLabel(s.weeks_of_month)})
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
              )}
              {m.address_line1 && (
                <p className="text-base text-text-body m-0 mt-2">
                  {m.address_line1}
                  {m.city ? `, ${m.city}` : ""}
                  {m.room ? ` — ${m.room}` : ""}
                </p>
              )}
              {m.type_codes.length > 0 && (
                <ul className="list-none p-0 m-0 mt-2 flex flex-wrap gap-1.5" aria-label="Meeting formats">
                  {m.type_codes.map((code) => (
                    <li
                      key={code}
                      className="rounded-full bg-surface px-2.5 py-0.5 text-sm text-text-body"
                    >
                      {typeLabels[code] ?? code}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pillClass =
  "flex items-center min-h-11 px-4 rounded-full border border-[#C9C9CE] bg-surface-raise text-base text-text-body no-underline hover:border-brand-action";
const pillActiveClass =
  "flex items-center min-h-11 px-4 rounded-full bg-brand-action text-white text-base font-semibold no-underline";
