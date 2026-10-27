import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getCategories,
  getCountiesInRegion,
  searchResources,
  type Resource,
} from "@/lib/db";
import { formatDate, telHref } from "@/lib/format";
import { SkeletonFilters, SkeletonResults } from "@/components/skeletons";
import { CopyResultsButton } from "@/components/copy-results-button";

export const metadata = {
  title: "For Professionals",
  description:
    "Professional-facing directory: full taxonomy filters, deterministic copy-results export, and print-ready handouts. Built from the published data with last-verified dates.",
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildUrl(q: string, category: string, county: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category) params.set("category", category);
  if (county) params.set("county", county);
  const qs = params.toString();
  return qs ? `/professionals?${qs}` : "/professionals";
}

export default async function ProfessionalsPage({
  searchParams,
}: PageProps<"/professionals">) {
  const sp = await searchParams;
  const q = firstParam(sp.q).trim();
  const category = firstParam(sp.category).trim();
  const county = firstParam(sp.county).trim();

  return (
    <div>
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <h1 className="font-headline font-bold text-3xl sm:text-4xl m-0">
            For Professionals
          </h1>
          <p className="font-subhead text-lg text-white/90 mt-2 m-0">
            The full professional taxonomy, referral-ready filters, and a
            deterministic export for clinical notes — every result carries
            its last-verified date.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Suspense fallback={<SkeletonFilters />}>
          <ProFilters q={q} category={category} county={county} />
        </Suspense>

        <Suspense
          key={`${q}|${category}|${county}`}
          fallback={<SkeletonResults />}
        >
          <ProResults q={q} category={category} county={county} />
        </Suspense>
      </div>
    </div>
  );
}

async function ProFilters({
  q,
  category,
  county,
}: {
  q: string;
  category: string;
  county: string;
}) {
  await connection();
  const [{ data: categories }, { data: counties }] = await Promise.all([
    getCategories(),
    getCountiesInRegion(),
  ]);

  return (
    <search>
      <form
        action="/professionals"
        method="get"
        className="bg-surface rounded-lg p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
      >
        <div>
          <label
            htmlFor="pro-q"
            className="block font-semibold text-brand-primary mb-1"
          >
            Search
          </label>
          <input
            id="pro-q"
            name="q"
            type="search"
            key={`q-${q}`}
            defaultValue={q}
            placeholder="Name, service, or keyword"
            className="w-full min-h-11 px-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
          />
        </div>
        <div>
          <label
            htmlFor="pro-category"
            className="block font-semibold text-brand-primary mb-1"
          >
            Category
          </label>
          <select
            id="pro-category"
            name="category"
            key={`cat-${category}`}
            defaultValue={category}
            className="select-chevron w-full min-h-11 pl-3 rounded-md text-base text-text-body bg-surface-raise border border-[#C9C9CE] focus:border-brand-action"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="pro-county"
            className="block font-semibold text-brand-primary mb-1"
          >
            County
          </label>
          <select
            id="pro-county"
            name="county"
            key={`cty-${county}`}
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
      {(q || category || county) && (
        <p className="mt-2 text-base">
          <Link
            href="/professionals"
            className="text-brand-action font-semibold no-underline hover:underline hover:underline-offset-4"
          >
            Clear all filters
          </Link>
        </p>
      )}
    </search>
  );
}

async function ProResults({
  q,
  category,
  county,
}: {
  q: string;
  category: string;
  county: string;
}) {
  await connection();
  const { data: resources, dbError } = await searchResources({
    q,
    category,
    county,
  });

  const exportText = formatExport(resources, { q, category, county });

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-base text-text-body m-0" role="status">
          {dbError
            ? "The directory is temporarily unavailable — please try again shortly."
            : `${resources.length} ${resources.length === 1 ? "organisation" : "organisations"}`}
          {category && ` · ${category}`}
          {county && ` · ${county} County`}
          {q && ` · matching "${q}"`}
        </p>
        {resources.length > 0 && !dbError && (
          <CopyResultsButton text={exportText} />
        )}
      </div>

      {resources.length === 0 && !dbError ? (
        <div className="bg-surface rounded-lg p-6">
          <p className="mt-0 mb-3">
            No organisations matched. Try a different category or broaden the
            county filter.
          </p>
          <Link
            href="/professionals"
            className="text-brand-action font-semibold no-underline hover:underline hover:underline-offset-4"
          >
            Show everything
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Professional directory results — {resources.length} organisations
            </caption>
            <thead>
              <tr className="bg-brand-primary text-white text-left">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Organisation
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Categories
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Phone
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Counties served
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Last verified
                </th>
              </tr>
            </thead>
            <tbody>
              {resources.map((r, i) => (
                <tr
                  key={r.slug}
                  className={i % 2 === 0 ? "bg-surface" : "bg-surface-raise"}
                >
                  <th scope="row" className="px-3 py-2 text-left">
                    <Link
                      href={`/resources/${r.slug}`}
                      className="text-text-body font-semibold no-underline hover:text-brand-action"
                    >
                      {r.name}
                    </Link>
                    {r.website && (
                      <>
                        <br />
                        <a
                        href={r.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-action no-underline"
                      >
                        website
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                      </>
                    )}
                  </th>
                  <td className="px-3 py-2">{r.categories.join(", ")}</td>
                  <td className="px-3 py-2">
                    {r.public_phone ? (
                      <a
                        href={telHref(r.public_phone)}
                        className="text-brand-action no-underline"
                      >
                        {r.public_phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.counties_served.length > 0
                      ? r.counties_served.slice(0, 4).join(", ") +
                        (r.counties_served.length > 4
                          ? ` +${r.counties_served.length - 4} more`
                          : "")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.last_verified_on ? (
                      formatDate(r.last_verified_on)
                    ) : (
                      <span className="text-text-body/50">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-sm text-text-body/70 m-0">
        Export format: plain text, deterministic (same filters → same output),
        with last-verified dates. Suitable for pasting into a clinical note
        or EHR. The print view produces a clean handout.
      </p>
    </div>
  );
}

function formatExport(
  resources: Resource[],
  filters: { q: string; category: string; county: string },
): string {
  const lines: string[] = [];
  lines.push("REACH Directory — Professional Export");
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  const active: string[] = [];
  if (filters.q) active.push(`search "${filters.q}"`);
  if (filters.category) active.push(`category: ${filters.category}`);
  if (filters.county) active.push(`county: ${filters.county}`);
  lines.push(`Filter: ${active.length ? active.join(", ") : "none (all organisations)"}`);
  lines.push(`Results: ${resources.length} organisation${resources.length === 1 ? "" : "s"}`);
  lines.push("");

  resources.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.name}`);
    if (r.categories.length > 0) {
      lines.push(`   Categories: ${r.categories.join("; ")}`);
    }
    if (r.public_phone) lines.push(`   Phone: ${r.public_phone}`);
    if (r.website) lines.push(`   Website: ${r.website}`);
    if (r.counties_served.length > 0) {
      lines.push(`   Counties served: ${r.counties_served.join(", ")}`);
    }
    lines.push(
      `   Last verified: ${r.last_verified_on ? formatDate(r.last_verified_on) : "pending"}`,
    );
    if (r.locations.length > 0) {
      const loc = r.locations[0];
      const addr = [loc.address, loc.city, loc.state, loc.postal_code]
        .filter(Boolean)
        .join(", ");
      if (addr) lines.push(`   Address: ${addr}`);
    }
    lines.push("");
  });

  lines.push("---");
  lines.push(
    "Source: Northeast Tennessee Reach directory (reach directory data, published listings only).",
  );
  lines.push(
    "Verify currency at https://reach-chi-lyart.vercel.app or contact the REACH team.",
  );

  return lines.join("\n");
}
