import Link from "next/link";

export const metadata = {
  title: "Find a Meeting",
  description:
    "Mutual-aid meetings across Northeast Tennessee — AA, NA, Al-Anon, and other fellowships.",
};

export default function MeetingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="font-headline font-bold text-3xl sm:text-4xl text-brand-primary m-0">
        Find a meeting
      </h1>
      <p className="font-subhead text-lg mt-3 m-0">
        Mutual-aid meetings — AA, NA, Al-Anon, Celebrate Recovery, and more
        — with days, times, and meeting formats.
      </p>
      <div className="mt-8 bg-surface rounded-lg p-6">
        <p className="mt-0 mb-3 font-semibold text-brand-primary">
          The meetings path is coming in the next build phase
        </p>
        <p className="mb-3">
          Meetings recur on schedules rather than keeping office hours, so
          they get their own search — by day, by fellowship, and by
          what&rsquo;s on tonight near you.
        </p>
        <p className="m-0">
          Until then, mutual-aid organizations appear in the main directory:{" "}
          <Link
            href="/resources?topic=meetings-near-me"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            browse meetings near me
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
