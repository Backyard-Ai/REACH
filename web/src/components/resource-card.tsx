import Link from "next/link";
import type { Resource } from "@/lib/db";
import { telHref } from "@/lib/format";

export function ResourceCard({ resource }: { resource: Resource }) {
  const hasAddress = resource.locations.length > 0;
  const coveredCounties = resource.county_coverage.map((c) => c.county);
  const firstLocation = hasAddress ? resource.locations[0] : null;
  const moreLocations = resource.locations.length - 1;

  return (
    <li>
      <article className="h-full bg-surface-raise rounded-lg border border-surface p-5">
        <h2 className="font-subhead font-bold text-xl mt-0 mb-1">
          <Link
            href={`/resources/${resource.slug}`}
            className="text-brand-primary underline decoration-brand-accent decoration-2 underline-offset-4 hover:text-brand-action hover:decoration-4"
          >
            {resource.name}
          </Link>
        </h2>
        {resource.categories.length > 0 && (
          <ul className="list-none p-0 m-0 flex flex-wrap gap-2">
            {resource.categories.map((category) => (
              <li
                key={category}
                className="rounded-full bg-surface px-3 py-1 text-sm font-semibold text-brand-primary"
              >
                {category}
              </li>
            ))}
          </ul>
        )}
        {resource.description && (
          <p className="text-base text-text-body mt-3 mb-0 line-clamp-3">
            {resource.description}
          </p>
        )}
        {firstLocation && (
          <p className="text-base text-text-body mt-3 mb-0">
            <span className="font-semibold">Location:</span>{" "}
            {firstLocation.city}, {firstLocation.state}
            {moreLocations > 0 &&
              ` + ${moreLocations} more ${
                moreLocations === 1 ? "location" : "locations"
              }`}
          </p>
        )}
        {!hasAddress && coveredCounties.length > 0 && (
          <p className="rounded-md border-l-4 border-brand-accent bg-surface px-4 py-3 text-sm text-text-body mt-3 mb-0">
            <strong className="font-semibold">Serves your whole county</strong>{" "}
            — no walk-in address.{" "}
            <span className="block mt-1">
              Covers: {coveredCounties.join(", ")}
            </span>
          </p>
        )}
        {resource.public_phone && (
          <p className="mt-3 mb-0">
            <a
              href={telHref(resource.public_phone)}
              className="inline-flex items-center min-h-11 text-brand-action font-semibold underline decoration-2 underline-offset-4 hover:text-brand-action-hover"
            >
              Call {resource.public_phone}
            </a>
          </p>
        )}
      </article>
    </li>
  );
}
