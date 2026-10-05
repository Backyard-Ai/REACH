import Link from "next/link";
import { connection } from "next/server";
import { getCountiesInRegion, getTopics, searchResources } from "@/lib/db";
import { ResourceCard } from "@/components/resource-card";

export const metadata = {
  title: "Find Resources",
  description:
    "Search recovery resources across ten Northeast Tennessee counties — filter by what you need and your county.",
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function ResourcesPage({
  searchParams,
}: PageProps<"/resources">) {
  await connection();
  const sp = await searchParams;
  const q = firstParam(sp.q).trim();
  const topic = firstParam(sp.topic).trim();
  const county = firstParam(sp.county).trim();
  const hasFilters = Boolean(q || topic || county);

  const [{ data: topics }, { data: counties }, { data: resources, dbError }] =
    await Promise.all([
      getTopics(),
      getCountiesInRegion(),
      searchResources({ q, topic, county }),
    ]);

  const activeTopic = topics.find((t) => t.slug === topic);

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
        {/* Filters live in the URL: every view is a shareable link. */}
        <search>
          <form
            action="/resources"
            method="get"
            className="bg-surface rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
          >
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
                className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border-2 border-transparent focus:border-brand-action"
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
                className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border-2 border-transparent focus:border-brand-action"
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
                className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border-2 border-transparent focus:border-brand-action"
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
          {hasFilters && (
            <p className="mt-2 text-base">
              <Link
                href="/resources"
                className="text-brand-action font-semibold underline underline-offset-4"
              >
                Clear all filters
              </Link>
            </p>
          )}
        </search>

        <div className="mt-6">
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

          {resources.length === 0 && !dbError ? (
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
      </div>
    </div>
  );
}
