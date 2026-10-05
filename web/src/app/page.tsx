import Link from "next/link";
import { connection } from "next/server";
import { getTopics } from "@/lib/db";

export default async function HomePage() {
  await connection();
  const { data: topics } = await getTopics();

  return (
    <div>
      {/* Hero — one search box, no dropdowns. Filters arrive after results. */}
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16 text-center">
          <h1 className="font-headline font-bold text-3xl sm:text-5xl m-0">
            Recovery help in Northeast Tennessee
          </h1>
          <p className="font-subhead text-lg sm:text-xl text-white/90 mt-4 m-0">
            One place to find treatment, meetings, housing, and support —
            across ten counties, for yourself or someone you care about.
          </p>
          <search className="mt-8">
            <form action="/resources" method="get" className="flex gap-2">
              <label htmlFor="home-search" className="sr-only">
                Search resources by name, service, or keyword
              </label>
              <input
                id="home-search"
                name="q"
                type="search"
                autoComplete="off"
                placeholder="Search by name, service, or keyword"
                className="flex-1 min-h-11 px-4 rounded-md text-base text-text-body bg-surface-raise border-2 border-brand-action focus:border-brand-accent"
              />
              <button
                type="submit"
                className="min-h-11 px-5 rounded-md bg-brand-accent text-brand-primary font-headline font-bold text-base hover:opacity-90"
              >
                Search
              </button>
            </form>
          </search>
          <p className="text-sm text-white/80 mt-3 m-0">
            In crisis right now?{" "}
            <Link
              href="/get-help"
              className="text-white font-bold underline decoration-brand-accent decoration-2 underline-offset-4"
            >
              Get help now
            </Link>
          </p>
        </div>
      </section>

      {/* Four routes in */}
      <section aria-labelledby="start-heading" className="bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2
            id="start-heading"
            className="font-headline font-bold text-2xl sm:text-3xl text-brand-primary m-0"
          >
            Where would you like to start?
          </h2>
          <ul className="list-none p-0 mt-6 grid gap-4 sm:grid-cols-2">
            <li>
              <Link
                href="/get-help"
                className="block h-full bg-surface-raise rounded-lg border border-surface border-l-4 border-l-crisis p-5 no-underline hover:border-brand-action"
              >
                <h3 className="font-subhead font-bold text-xl text-brand-primary mt-0 mb-1">
                  I need help now
                </h3>
                <p className="text-base text-text-body m-0">
                  Crisis lines that answer 24 hours a day, free and
                  confidential. One tap to call.
                </p>
              </Link>
            </li>
            <li>
              <Link
                href="/resources"
                className="block h-full bg-surface-raise rounded-lg border border-surface border-l-4 border-l-brand-action p-5 no-underline hover:border-brand-action"
              >
                <h3 className="font-subhead font-bold text-xl text-brand-primary mt-0 mb-1">
                  Help for myself
                </h3>
                <p className="text-base text-text-body m-0">
                  Search and browse treatment, mutual-aid meetings, recovery
                  housing, and peer support near you.
                </p>
              </Link>
            </li>
            <li>
              <Link
                href="/resources?topic=someone-to-talk-to"
                className="block h-full bg-surface-raise rounded-lg border border-surface border-l-4 border-l-brand-action p-5 no-underline hover:border-brand-action"
              >
                <h3 className="font-subhead font-bold text-xl text-brand-primary mt-0 mb-1">
                  Helping someone else
                </h3>
                <p className="text-base text-text-body m-0">
                  Someone to talk to, family support, and peer specialists who
                  understand substance use — for you and the person you care
                  about.
                </p>
              </Link>
            </li>
            <li>
              <Link
                href="/professionals"
                className="block h-full bg-surface-raise rounded-lg border border-surface border-l-4 border-l-brand-action p-5 no-underline hover:border-brand-action"
              >
                <h3 className="font-subhead font-bold text-xl text-brand-primary mt-0 mb-1">
                  I&rsquo;m a professional
                </h3>
                <p className="text-base text-text-body m-0">
                  The full professional taxonomy, referral-ready filters, and
                  a deterministic export — arriving in the next build phase.
                </p>
              </Link>
            </li>
          </ul>
        </div>
      </section>

      {/* Plain-language browse */}
      <section aria-labelledby="browse-heading">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2
            id="browse-heading"
            className="font-headline font-bold text-2xl sm:text-3xl text-brand-primary m-0"
          >
            Browse by what you need
          </h2>
          <p className="text-base mt-2 m-0">
            No jargon — pick what sounds right and we&rsquo;ll show you what
            matches.
          </p>
          {topics.length === 0 ? (
            <p className="mt-6 text-text-body bg-surface rounded-lg p-5 m-0">
              Topics will appear here once the directory data is loaded.{" "}
              <Link
                href="/resources"
                className="text-brand-action font-semibold underline underline-offset-4"
              >
                Browse all resources
              </Link>
            </p>
          ) : (
            <ul className="list-none p-0 mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/resources?topic=${topic.slug}`}
                    className="block h-full bg-surface rounded-lg p-5 no-underline hover:bg-surface-raise hover:outline hover:outline-2 hover:outline-brand-action"
                  >
                    <h3 className="font-subhead font-bold text-lg text-brand-primary mt-0 mb-1">
                      {topic.label}
                    </h3>
                    {topic.description && (
                      <p className="text-base text-text-body m-0">
                        {topic.description}
                      </p>
                    )}
                    {topic.categories.length > 0 && (
                      <p className="text-sm text-text-body/70 mt-2 m-0">
                        Includes: {topic.categories.map((c) => c.name).join(", ")}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Map placeholder — interactive map is a later phase */}
      <section aria-labelledby="map-heading" className="bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-12">
          <h2
            id="map-heading"
            className="font-headline font-bold text-2xl sm:text-3xl text-brand-primary m-0"
          >
            Map view
          </h2>
          <div
            role="img"
            aria-label="Placeholder for the upcoming interactive map of resources across the ten counties"
            className="mt-6 rounded-lg border-2 border-dashed border-brand-accent bg-surface-raise px-6 py-12 text-center"
          >
            <p className="font-subhead italic text-lg text-text-body mt-0 mb-2">
              An interactive map is on the way.
            </p>
            <p className="text-base text-text-body m-0">
              Until then, every resource is in the list — including services
              that cover your whole county without a walk-in address.{" "}
              <Link
                href="/resources"
                className="text-brand-action font-semibold underline underline-offset-4"
              >
                Browse the full list
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
