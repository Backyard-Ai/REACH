import Link from "next/link";
import { connection } from "next/server";
import { getCrisisLines } from "@/lib/db";
import { telHref } from "@/lib/format";

export async function SiteFooter() {
  await connection(); // footer reads live crisis data — always render fresh
  const { data: lines } = await getCrisisLines();
  const primary = lines[0]; // first by sort_order (TN REDLINE when seeded)

  return (
    <footer>
      {primary && (
        <div className="bg-crisis text-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-center">
            <p className="font-headline font-bold text-lg m-0">
              In crisis right now?
            </p>
            <p className="m-0">
              Call or text{" "}
              <a
                href={telHref(primary.phone)}
                className="text-white font-bold underline decoration-brand-accent decoration-2 underline-offset-4 hover:decoration-4"
              >
                {primary.label} {primary.phone}
              </a>{" "}
              — free, confidential, 24/7.
            </p>
            <Link
              href="/get-help"
              className="flex items-center min-h-11 px-4 rounded-md bg-white text-crisis font-headline font-bold no-underline hover:bg-surface"
            >
              All crisis lines
            </Link>
          </div>
        </div>
      )}
      <div className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 grid gap-10 sm:grid-cols-3">
          <div>
            <p className="font-headline font-bold text-xl mt-0">
              Northeast Tennessee Reach
            </p>
            <p className="text-brand-accent font-accent text-2xl m-0">
              Help is within reach.
            </p>
            <p className="text-sm text-white/85 mt-3 m-0">
              A recovery resource directory for ten Northeast Tennessee
              counties, built for people seeking recovery, the people who
              support them, and the professionals who serve them.
            </p>
          </div>
          <nav aria-label="Footer">
            <h2 className="font-headline font-bold text-lg mt-0 mb-2 text-brand-accent">
              Directory
            </h2>
            <ul className="list-none p-0 m-0 space-y-1">
              <li>
                <Link
                  href="/resources"
                  className="flex items-center min-h-11 text-white no-underline underline-offset-4 hover:underline hover:decoration-brand-accent hover:decoration-2"
                >
                  Find Resources
                </Link>
              </li>
              <li>
                <Link
                  href="/submit"
                  className="flex items-center min-h-11 text-white no-underline underline-offset-4 hover:underline hover:decoration-brand-accent hover:decoration-2"
                >
                  Submit a listing
                </Link>
              </li>
              <li>
                <Link
                  href="/meetings"
                  className="flex items-center min-h-11 text-white no-underline underline-offset-4 hover:underline hover:decoration-brand-accent hover:decoration-2"
                >
                  Find a meeting
                </Link>
              </li>
              <li>
                <Link
                  href="/professionals"
                  className="flex items-center min-h-11 text-white no-underline underline-offset-4 hover:underline hover:decoration-brand-accent hover:decoration-2"
                >
                  For Professionals
                </Link>
              </li>
              <li>
                <Link
                  href="/about"
                  className="flex items-center min-h-11 text-white no-underline underline-offset-4 hover:underline hover:decoration-brand-accent hover:decoration-2"
                >
                  About this directory
                </Link>
              </li>
            </ul>
          </nav>
          <div>
            <h2 className="font-headline font-bold text-lg mt-0 mb-2 text-brand-accent">
              Funding acknowledgment
            </h2>
            <p className="text-sm text-white/85 m-0">
              {/* Placeholder — confirmed wording lands before launch */}
              This project is supported by [funding acknowledgment
              placeholder — East Tennessee State University and the
              Tennessee Department of Health / TDMHSAS].
            </p>
          </div>
        </div>
        <div className="border-t border-white/20">
          <p className="mx-auto w-full max-w-6xl px-4 py-3 text-sm text-white/85 m-0">
            Northeast Tennessee Reach · Listing information is reviewed by
            people, for people. Every listing page shows when it was last
            verified.
          </p>
        </div>
      </div>
    </footer>
  );
}
