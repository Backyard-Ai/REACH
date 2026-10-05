import Link from "next/link";

export const metadata = {
  title: "For Professionals",
  description:
    "Professional-facing view of the REACH directory — full taxonomy, referral filters, and deterministic export.",
};

export default function ProfessionalsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="font-headline font-bold text-3xl sm:text-4xl text-brand-primary m-0">
        For Professionals
      </h1>
      <p className="font-subhead text-lg mt-3 m-0">
        The same directory, built for referrals: the full professional
        taxonomy, clinical filters, a copy-results export for notes and
        EHRs, and a print view for handouts.
      </p>
      <div className="mt-8 bg-surface rounded-lg p-6">
        <p className="mt-0 mb-3 font-semibold text-brand-primary">
          Coming in the next build phase
        </p>
        <p className="mb-3">
          This page ships with the professional filter set and the
          deterministic export — output that goes into a clinical note or a
          client&rsquo;s hands has to be exactly the filtered set,
          reproducible, with last-verified dates attached.
        </p>
        <p className="m-0">
          The public directory is ready now:{" "}
          <Link
            href="/resources"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            browse resources
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
