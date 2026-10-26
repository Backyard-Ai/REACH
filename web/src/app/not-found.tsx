import Link from "next/link";

export const metadata = {
  title: "Page Not Found",
};

export default function NotFound() {
  return (
    <div>
      <section className="bg-brand-primary text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-10">
          <h1 className="font-headline font-bold text-3xl sm:text-4xl m-0">
            We can&rsquo;t find that page
          </h1>
          <p className="font-subhead text-lg text-white/90 mt-3 m-0">
            The link may be out of date, or the listing may have moved.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-8 grid gap-4">
        <search>
          <form action="/resources" method="get" className="flex gap-2">
            <label htmlFor="notfound-search" className="sr-only">
              Search resources by name, service, or keyword
            </label>
            <input
              id="notfound-search"
              name="q"
              type="search"
              placeholder="Search by name, service, or keyword"
              className="flex-1 min-h-11 px-4 rounded-md text-base text-text-body bg-surface-raise border-2 border-brand-action focus:border-brand-accent"
            />
            <button
              type="submit"
              className="min-h-11 px-5 rounded-md bg-brand-accent text-brand-primary font-headline font-bold text-base hover:opacity-90"
            >
              Search
            </button>
          </form>
        </search>

        <p className="text-base m-0">
          Or{" "}
          <Link
            href="/resources"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            browse all resources
          </Link>
          {" · "}
          <Link
            href="/meetings"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            find a meeting
          </Link>
          {" · "}
          <Link
            href="/"
            className="text-brand-action font-semibold underline underline-offset-4"
          >
            go to the home page
          </Link>
        </p>

        <p className="text-base m-0 pt-4 border-t border-surface">
          In crisis right now?{" "}
          <Link
            href="/get-help"
            className="text-crisis font-bold underline underline-offset-4"
          >
            Get help now — crisis lines that answer 24/7
          </Link>
        </p>
      </div>
    </div>
  );
}
