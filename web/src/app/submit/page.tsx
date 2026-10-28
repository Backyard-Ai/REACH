import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getAttributesByKind,
  getCategories,
  getCountiesInRegion,
} from "@/lib/db";
import { SubmissionWizard, type LookupData } from "@/components/submission-wizard";
import { SkeletonFilters } from "@/components/skeletons";

export const metadata = {
  title: "Submit a Listing",
  description:
    "Add a recovery resource to the Northeast Tennessee Reach directory — a person reviews every submission before it goes live.",
};

export default function SubmitPage() {
  return (
    <div>
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-8">
          <h1 className="font-headline font-bold text-3xl sm:text-4xl m-0">
            Submit a listing
          </h1>
          <p className="font-subhead text-lg text-white/90 mt-2 m-0">
            Know a resource that&rsquo;s missing, or run one yourself? A person
            reviews every submission before it publishes — usually within a
            few business days.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Suspense fallback={<SkeletonFilters />}>
          <WizardWithData />
        </Suspense>

        <p className="mt-8 text-base m-0">
          Spotted something wrong on an existing listing? Every listing page
          has a{" "}
          <Link
            href="/resources"
            className="text-brand-action font-semibold no-underline hover:underline hover:underline-offset-4"
          >
            &ldquo;this information is wrong&rdquo;
          </Link>{" "}
          link that reaches the same review team.
        </p>
      </div>
    </div>
  );
}

async function WizardWithData() {
  await connection();
  const [{ data: categories }, { data: counties }, { data: attributes }] =
    await Promise.all([
      getCategories(),
      getCountiesInRegion(),
      getAttributesByKind(),
    ]);

  const lookups: LookupData = {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    counties: counties.map((c) => ({ fips: c.fips, name: c.name })),
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([kind, attrs]) => [
        kind,
        attrs.map((a) => ({ slug: a.slug, label: a.label })),
      ]),
    ),
  };

  return <SubmissionWizard lookups={lookups} />;
}
