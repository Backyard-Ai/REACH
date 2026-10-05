import Link from "next/link";

export const metadata = {
  title: "Submit a Listing",
  description:
    "Add or update a listing in the Northeast Tennessee Reach directory.",
};

export default function SubmitPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="font-headline font-bold text-3xl sm:text-4xl text-brand-primary m-0">
        Submit a listing
      </h1>
      <p className="font-subhead text-lg mt-3 m-0">
        Know a resource that&rsquo;s missing, or run one yourself? Tell us —
        a person reviews every submission before it publishes.
      </p>
      <div className="mt-8 bg-surface rounded-lg p-6">
        <p className="mt-0 mb-3 font-semibold text-brand-primary">
          The submission form is coming in the next build phase
        </p>
        <p className="mb-3">
          It will cover services, hours, access, populations served,
          payment, and eligibility — with spam protection and an email when
          the review is done.
        </p>
        <p className="mb-3">
          Spotted something wrong on an existing listing? Every listing page
          already has a &ldquo;this information is wrong&rdquo; link that
          reaches the same review queue.
        </p>
        <p className="m-0">
          <Link
            href="/resources"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            Browse resources
          </Link>
        </p>
      </div>
    </div>
  );
}
