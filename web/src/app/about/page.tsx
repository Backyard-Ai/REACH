import Link from "next/link";

export const metadata = {
  title: "About",
  description:
    "About Northeast Tennessee Reach — who builds the directory, where the data comes from, and how listings stay current.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="font-headline font-bold text-3xl sm:text-4xl text-brand-primary m-0">
        About this directory
      </h1>
      <p className="font-subhead text-lg mt-3 m-0">
        Northeast Tennessee Reach connects people seeking recovery, the
        people supporting them, and the professionals who serve them with
        accurate, current resources across ten counties.
      </p>
      <div className="mt-8 grid gap-4">
        <section className="bg-surface rounded-lg p-6">
          <h2 className="font-headline font-bold text-xl text-brand-primary mt-0 mb-2">
            The data behind the directory
          </h2>
          <p className="m-0">
            Listings come from the regional recovery-asset master list,
            reviewed by people before anything publishes. Every listing page
            shows when the information was last verified, and every page has
            a &ldquo;this information is wrong&rdquo; link — the two things
            that keep a directory honest after handover.
          </p>
        </section>
        <section className="bg-surface rounded-lg p-6">
          <h2 className="font-headline font-bold text-xl text-brand-primary mt-0 mb-2">
            Partners
          </h2>
          <p className="m-0">
            A collaboration with East Tennessee State University, supported
            by state funding. Partner credits and co-branding land here
            before launch.
          </p>
        </section>
        <section className="bg-surface rounded-lg p-6">
          <h2 className="font-headline font-bold text-xl text-brand-primary mt-0 mb-2">
            Stories
          </h2>
          <p className="mb-3">
            Recovery stories from the community, published only with written
            consent — first name only, no photo, or county-level location,
            as each contributor chooses. Coming in a later phase.
          </p>
          <p className="m-0">
            Start with the directory instead:{" "}
            <Link
              href="/resources"
              className="text-brand-action font-semibold underline underline-offset-4"
            >
              find resources
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
