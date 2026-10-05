import { connection } from "next/server";
import Link from "next/link";
import { getCrisisLines } from "@/lib/db";
import { telHref } from "@/lib/format";

export const metadata = {
  title: "Get Help Now",
  description:
    "Crisis lines that answer 24/7 for substance use and mental health crises across Northeast Tennessee: TN REDLINE, 988, the Statewide Crisis Line, and 911.",
};

export default async function GetHelpPage() {
  await connection();
  const { data: lines } = await getCrisisLines();
  const direct = lines.filter((line) => line.slug !== "911");
  const emergency = lines.find((line) => line.slug === "911");

  return (
    <div>
      <section className="bg-crisis text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <h1 className="font-headline font-bold text-3xl sm:text-4xl m-0">
            Get help now
          </h1>
          <p className="font-subhead text-lg text-white/95 mt-3 m-0">
            If you or someone you know is in crisis, these lines answer 24
            hours a day. Calling is free and confidential, and you don&rsquo;t
            have to know what to say — they&rsquo;ll take it from there.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        {lines.length === 0 ? (
          <p className="bg-surface rounded-lg p-5 m-0">
            Crisis line information is being loaded. If you need help right
            now, call or text{" "}
            <strong>988</strong> (Suicide &amp; Crisis Lifeline) or{" "}
            <strong>911</strong> for medical emergencies.
          </p>
        ) : (
          <>
            <h2 className="sr-only">Crisis lines</h2>
            <ul className="list-none p-0 grid gap-4">
              {direct.map((line) => (
                <li key={line.slug}>
                  <a
                    href={telHref(line.phone)}
                    className="block bg-surface-raise rounded-lg border-2 border-brand-primary p-5 no-underline hover:border-brand-action"
                  >
                    <span className="block font-headline font-bold text-xl text-brand-primary">
                      {line.label}
                    </span>
                    <span className="block font-headline font-bold text-3xl text-brand-action mt-1">
                      {line.phone}
                    </span>
                    {line.description && (
                      <span className="block text-base text-text-body mt-2">
                        {line.description}
                      </span>
                    )}
                    <span className="inline-block mt-3 rounded-full bg-brand-primary text-white text-sm font-semibold px-3 py-1">
                      Tap to call · 24/7
                    </span>
                  </a>
                </li>
              ))}
            </ul>

            {emergency && (
              <details className="mt-6 rounded-lg border-2 border-crisis bg-surface-raise p-2">
                <summary className="flex items-center min-h-11 px-3 font-headline font-bold text-lg text-crisis">
                  Show 911 — for medical emergencies
                </summary>
                <div className="px-3 pb-3">
                  {emergency.description && (
                    <p className="text-base text-text-body mt-2">
                      {emergency.description}
                    </p>
                  )}
                  <a
                    href={telHref(emergency.phone)}
                    className="inline-flex items-center min-h-11 px-5 mt-3 rounded-md bg-crisis text-white font-headline font-bold no-underline hover:bg-crisis-hover"
                  >
                    Call {emergency.phone}
                  </a>
                </div>
              </details>
            )}
          </>
        )}

        <section aria-labelledby="what-happens" className="mt-12">
          <h2
            id="what-happens"
            className="font-headline font-bold text-2xl text-brand-primary m-0"
          >
            What happens when you call
          </h2>
          <div className="mt-4 grid gap-4">
            <div className="bg-surface rounded-lg p-5">
              <h3 className="font-subhead font-bold text-lg text-brand-primary mt-0 mb-1">
                You don&rsquo;t need the right words
              </h3>
              <p className="m-0">
                A trained counselor answers and listens without judgment.
                They may ask a few questions to understand what&rsquo;s going
                on — you can answer as much or as little as you want.
              </p>
            </div>
            <div className="bg-surface rounded-lg p-5">
              <h3 className="font-subhead font-bold text-lg text-brand-primary mt-0 mb-1">
                Nothing is forced
              </h3>
              <p className="m-0">
                Calling a crisis line doesn&rsquo;t start a police response or
                commit you to anything. The counselor helps you figure out the
                next step — which might be a referral to treatment, a peer
                specialist, or simply talking it through.
              </p>
            </div>
            <div className="bg-surface rounded-lg p-5">
              <h3 className="font-subhead font-bold text-lg text-brand-primary mt-0 mb-1">
                Someone else can call for you
              </h3>
              <p className="m-0">
                Family members, friends, and neighbors can call any of these
                lines to ask questions about how to help a person using
                substances — including what to do right now.
              </p>
            </div>
            <div className="bg-surface rounded-lg p-5">
              <h3 className="font-subhead font-bold text-lg text-brand-primary mt-0 mb-1">
                If you call 911 during an overdose
              </h3>
              <p className="m-0">
                A 911 call can bring a police response as well as an
                ambulance — one reason people hesitate to call during an
                overdose. Tennessee law can protect people who call for help
                for an overdose from certain drug charges, and giving
                naloxone is safe even if opioids aren&rsquo;t the cause. When
                in doubt, call — a life is worth more than a charge.
              </p>
            </div>
          </div>
        </section>

        <p className="mt-10 text-base m-0">
          Looking for ongoing support instead of crisis care?{" "}
          <Link
            href="/resources"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            Browse resources
          </Link>{" "}
          or{" "}
          <Link
            href="/resources?topic=someone-to-talk-to"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            find someone to talk to
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
