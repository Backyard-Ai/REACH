import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getResourceBySlug } from "@/lib/db";
import {
  directionsUrl,
  formatDate,
  formatTime,
  telHref,
  weekdayLabel,
} from "@/lib/format";
import { CorrectionForm } from "./correction-form";

export async function generateMetadata({
  params,
}: PageProps<"/resources/[slug]">) {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  return {
    title: resource?.name ?? "Resource",
    description:
      resource?.description?.slice(0, 160) ??
      "Recovery resource listing — Northeast Tennessee Reach.",
  };
}

export default async function ResourceDetailPage({
  params,
}: PageProps<"/resources/[slug]">) {
  await connection();
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  if (!resource) notFound();

  return (
    <div>
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-4xl px-4 py-8">
          <Link
            href="/resources"
            className="inline-flex items-center min-h-11 text-brand-accent font-semibold no-underline underline-offset-4 hover:underline hover:decoration-2"
          >
            ← All resources
          </Link>
          <h1 className="font-headline font-bold text-3xl sm:text-4xl mt-2 mb-3">
            {resource.name}
          </h1>
          <p
            className={`inline-block rounded-full px-4 py-1 text-sm font-semibold m-0 ${
              resource.last_verified_on
                ? "bg-brand-accent text-brand-primary"
                : "bg-white/15 text-white"
            }`}
          >
            {resource.last_verified_on
              ? `Last verified ${formatDate(resource.last_verified_on)}`
              : "Verification date pending"}
          </p>
          {resource.categories.length > 0 && (
            <ul className="list-none p-0 m-0 mt-3 flex flex-wrap gap-2">
              {resource.categories.map((category) => (
                <li
                  key={category}
                  className="rounded-full border border-brand-accent px-3 py-1 text-sm text-white"
                >
                  {category}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-4 py-8 grid gap-10">
        <section aria-labelledby="about-heading">
          <h2
            id="about-heading"
            className="font-headline font-bold text-2xl text-brand-primary m-0 mb-3"
          >
            About
          </h2>
          {resource.description ? (
            <p className="text-lg leading-relaxed m-0">
              {resource.description}
            </p>
          ) : (
            <p className="m-0">No description available yet.</p>
          )}
        </section>

        <section aria-labelledby="contact-heading">
          <h2
            id="contact-heading"
            className="font-headline font-bold text-2xl text-brand-primary m-0 mb-3"
          >
            Contact
          </h2>
          <div className="bg-surface rounded-lg p-5 grid gap-3">
            {resource.public_phone && (
              <p className="m-0">
                <a
                  href={telHref(resource.public_phone)}
                  className="inline-flex items-center min-h-11 text-brand-action font-bold text-xl underline decoration-2 underline-offset-4 hover:text-brand-action-hover"
                >
                  Call {resource.public_phone}
                </a>
              </p>
            )}
            {resource.public_email && (
              <p className="m-0">
                <a
                  href={`mailto:${resource.public_email}`}
                  className="inline-flex items-center min-h-11 text-brand-action font-semibold underline underline-offset-4 hover:text-brand-action-hover"
                >
                  {resource.public_email}
                </a>
              </p>
            )}
            {resource.website && (
              <p className="m-0">
                <a
                  href={resource.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-11 text-brand-action font-semibold underline underline-offset-4 hover:text-brand-action-hover"
                >
                  Visit website
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            )}
            {!resource.public_phone &&
              !resource.public_email &&
              !resource.website && (
                <p className="m-0">No public contact details on file yet.</p>
              )}
          </div>
        </section>

        <section aria-labelledby="locations-heading">
          <h2
            id="locations-heading"
            className="font-headline font-bold text-2xl text-brand-primary m-0 mb-3"
          >
            Locations
          </h2>
          {resource.locations.length === 0 ? (
            <p className="bg-surface rounded-lg p-5 m-0">
              This service has no walk-in address — it comes to your county.
              See <a href="#counties-served" className="text-brand-action font-semibold underline underline-offset-4">counties served</a> below.
            </p>
          ) : (
            <ul className="list-none p-0 grid gap-3">
              {resource.locations.map((location) => (
                <li
                  key={location.location_id}
                  className="bg-surface rounded-lg p-5"
                >
                  <address className="not-italic text-lg m-0">
                    {location.address}
                    <br />
                    {location.city}, {location.state} {location.postal_code}
                  </address>
                  <a
                    href={directionsUrl(location)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center min-h-11 mt-2 text-brand-action font-semibold underline underline-offset-4 hover:text-brand-action-hover"
                  >
                    Get directions
                    <span className="sr-only">
                      {" "}
                      to {resource.name} in {location.city} (opens Google Maps
                      in a new tab)
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="hours-heading">
          <h2
            id="hours-heading"
            className="font-headline font-bold text-2xl text-brand-primary m-0 mb-3"
          >
            Hours
          </h2>
          {resource.hours.length === 0 ? (
            <p className="bg-surface rounded-lg p-5 m-0">
              Hours not on file yet — call ahead before visiting.
            </p>
          ) : (
            <table className="w-full border-collapse text-base">
              <caption className="sr-only">
                Opening hours for {resource.name}
              </caption>
              <thead>
                <tr className="bg-brand-primary text-white text-left">
                  <th scope="col" className="px-4 py-3 font-semibold rounded-tl-lg">
                    Day
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Opens
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold rounded-tr-lg">
                    Closes
                  </th>
                </tr>
              </thead>
              <tbody>
                {resource.hours.map((entry, i) => (
                  <tr
                    key={`${entry.day}-${entry.opens}-${i}`}
                    className={i % 2 === 0 ? "bg-surface" : "bg-surface-raise"}
                  >
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      {weekdayLabel(entry.day)}
                    </th>
                    <td className="px-4 py-3">{formatTime(entry.opens)}</td>
                    <td className="px-4 py-3">{formatTime(entry.closes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section aria-labelledby="counties-served" id="counties-served">
          <h2 className="font-headline font-bold text-2xl text-brand-primary m-0 mb-3">
            Counties served
          </h2>
          {resource.county_coverage.length === 0 ? (
            <p className="bg-surface rounded-lg p-5 m-0">
              No service-area information on file yet.
            </p>
          ) : (
            <ul className="list-none p-0 grid gap-2 sm:grid-cols-2">
              {resource.county_coverage.map((coverage) => (
                <li
                  key={coverage.fips}
                  className="flex items-center justify-between gap-3 bg-surface rounded-md px-4 py-3"
                >
                  <span>{coverage.county} County</span>
                  {coverage.phone && (
                    <a
                      href={telHref(coverage.phone)}
                      className="text-brand-action font-semibold underline underline-offset-4 hover:text-brand-action-hover"
                    >
                      {coverage.phone}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="correction-heading">
          <h2
            id="correction-heading"
            className="font-headline font-bold text-2xl text-brand-primary m-0 mb-3"
          >
            Is this information wrong?
          </h2>
          <p className="mt-0 mb-4">
            Stale information in a recovery directory means someone arrives
            at a closed door on their worst day. Tell us what changed — a
            person reviews every report.
          </p>
          <CorrectionForm
            regionId={resource.region_id}
            organisationId={resource.id}
            resourceSlug={resource.slug}
            resourceName={resource.name}
          />
        </section>
      </div>
    </div>
  );
}
