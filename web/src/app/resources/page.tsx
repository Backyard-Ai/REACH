import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCountiesInRegion, getTopics, searchResources } from "@/lib/db";
import { ResourceCard } from "@/components/resource-card";
import { SkeletonFilters, SkeletonMap, SkeletonResults } from "@/components/skeletons";
import { ResourceMap } from "@/components/resource-map";
import { toMapPoints } from "@/lib/map-points";

export const metadata = {
  title: "Find Resources",
  description:
    "Search recovery resources across ten Northeast Tennessee counties — filter by what you need and your county.",
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function viewLink(q: string, topic: string, county: string, view: "list" | "map") {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (topic) params.set("topic", topic);
  if (county) params.set("county", county);
  if (view === "map") params.set("view", "map");
  const qs = params.toString();
  return qs ? `/resources?${qs}` : "/resources";
}

export default async function ResourcesPage({
  searchParams,
}: PageProps<"/resources">) {
  const sp = await searchParams;
  const q = firstParam(sp.q).trim();
  const topic = firstParam(sp.topic).trim();
  const county = firstParam(sp.county).trim();
  const view = firstParam(sp.view) === "map" ? "map" : "list";

  return (
    <div>
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <h1 className="font-headline font-bold text-3xl sm:text-4xl m-0">
            Find resources
          </h1>
          <p className="font-subhead text-lg text-white/90 mt-2 m-0">
            Support across ten Northeast Tennessee counties — search by name
            or keyword, or filter by what you need.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        {/* The shell paints instantly; filters and results stream in as
            their queries resolve — the difference shows on slow links. */}
        <Suspense fallback={<SkeletonFilters />}>
          <FilterForm q={q} topic={topic} county={county} view={view} />
        </Suspense>

        <Suspense key={`${q}|${topic}|${county}|${view}`} fallback={view === "map" ? <SkeletonMap /> : <SkeletonResults />}>
          <Results q={q} topic={topic} county={county} view={view} />
        </Suspense>
      </div>
    </div>
  );
}

async function FilterForm({
  q,
  topic,
  county,
  view,
}: {
  q: string;
  topic: string;
  county: string;
  view: "list" | "map";
}) {
  await connection();
  const [{ data: topics }, { data: counties }] = await Promise.all([
    getTopics(),
    getCountiesInRegion(),
  ]);

  return (
    <search>
      <form
        action="/resources"
        method="get"
        className="bg-surface rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        {/* GET forms drop params they don't contain — keep the view */}
        {view === "map" && <input type="hidden" name="view" value="map" />}
        <div>
          <label
            htmlFor="filter-q"
            className="block font-semibold text-brand-primary mb-1"
          >
            Search
          </label>
          <input
            id="filter-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Name, service, or keyword"
            className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
          />
        </div>
        <div>
          <label
            htmlFor="filter-topic"
            className="block font-semibold text-brand-primary mb-1"
          >
            I need
          </label>
          <select
            id="filter-topic"
            name="topic"
            defaultValue={topic}
            className="select-chevron w-full min-h-11 pl-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
          >
            <option value="">Any topic</option>
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="filter-county"
            className="block font-semibold text-brand-primary mb-1"
          >
            County
          </label>
          <select
            id="filter-county"
            name="county"
            defaultValue={county}
            className="select-chevron w-full min-h-11 pl-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
          >
            <option value="">All counties</option>
            {counties.map((c) => (
              <option key={c.fips} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="min-h-11 px-5 rounded-md bg-brand-action text-white font-headline font-bold hover:bg-brand-action-hover"
        >
          Apply
        </button>
      </form>
      {(q || topic || county) && (
        <p className="mt-2 text-base">
          <Link
            href={viewLink("", "", "", view)}
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            Clear all filters
          </Link>
        </p>
      )}
    </search>
  );
}

async function Results({
  q,
  topic,
  county,
  view,
}: {
  q: string;
  topic: string;
  county: string;
  view: "list" | "map";
}) {
  await connection();
  const [{ data: topics }, { data: resources, dbError }] = await Promise.all([
    getTopics(),
    searchResources({ q, topic, county }),
  ]);
  const activeTopic = topics.find((t) => t.slug === topic);

  const points = toMapPoints(resources);
  const coverageOnly = resources.filter(
    (r) => r.locations.length === 0 && r.county_coverage.length > 0,
  );

  return (
    <div className="mt-6">
      <nav aria-label="Result view" className="mb-4">
        <ul className="list-none p-0 m-0 inline-flex rounded-full border border-[#C9C9CE] overflow-hidden">
          <li>
            <a
              href={viewLink(q, topic, county, "list")}
              aria-current={view === "list" ? "true" : undefined}
              className={view === "list"
                ? "flex items-center min-h-11 px-5 bg-brand-primary text-white text-base font-semibold no-underline"
                : "flex items-center min-h-11 px-5 bg-surface-raise text-text-body text-base no-underline hover:text-brand-primary"}
            >
              List
            </a>
          </li>
          <li>
            <a
              href={viewLink(q, topic, county, "map")}
              aria-current={view === "map" ? "true" : undefined}
              className={view === "map"
                ? "flex items-center min-h-11 px-5 bg-brand-primary text-white text-base font-semibold no-underline"
                : "flex items-center min-h-11 px-5 bg-surface-raise text-text-body text-base no-underline hover:text-brand-primary"}
            >
              Map
            </a>
          </li>
        </ul>
      </nav>
      <p className="text-base text-text-body" role="status">
        {dbError
          ? "The directory is temporarily unavailable — please try again shortly."
          : `${resources.length} ${
              resources.length === 1 ? "resource" : "resources"
            }`}
        {activeTopic && ` in “${activeTopic.label}”`}
        {county && ` serving ${county} County`}
        {q && ` matching “${q}”`}
      </p>

      {view === "map" ? (
        <div>
          {coverageOnly.length > 0 && (
            <div className="mb-4 rounded-md border-l-4 border-brand-accent bg-surface px-4 py-3">
              <p className="m-0 text-sm font-semibold text-brand-primary">
                Serving your whole county — no walk-in address to map
              </p>
              <ul className="list-none p-0 m-0 mt-1">
                {coverageOnly.map((r) => (
                  <li key={r.slug} className="text-sm">
                    <a
                      href={`/resources/${r.slug}`}
                      className="text-brand-action font-semibold underline underline-offset-2"
                    >
                      {r.name}
                    </a>
                    {" — "}
                    {r.county_coverage.map((c) => c.county).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ResourceMap points={points} />
          {/* The map's screen-reader equivalent: every mapped result as a
              real list with real links (WCAG — the map is never the only
              way to reach a result). */}
          <ul className="sr-only">
            {resources.map((r) => (
              <li key={r.slug}>
                <a href={`/resources/${r.slug}`}>{r.name}</a>
                {r.locations[0]?.city ? ` — ${r.locations[0].city}` : ""}
                {r.locations.length === 0 && r.county_coverage.length > 0
                  ? " — serves " + r.county_coverage.map((c) => c.county).join(", ") + " County"
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : resources.length === 0 && !dbError ? (
        <div className="mt-4 bg-surface rounded-lg p-6">
          <p className="mt-0">
            Nothing matched{q ? ` “${q}”` : " those filters"}. Misspellings
            usually still work — try a shorter word, or browse by topic.
          </p>
          <p className="mb-0">
            <Link
              href="/resources"
              className="text-brand-action font-semibold underline underline-offset-4"
            >
              Show everything
            </Link>
          </p>
        </div>
      ) : (
        <ul className="list-none p-0 mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <ResourceCard key={resource.slug} resource={resource} />
          ))}
        </ul>
      )}
    </div>
  );
}
