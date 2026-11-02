import Link from "next/link";
import Image from "next/image";
import { NavLinks, type NavItem } from "./nav-links";

const NAV_ITEMS: NavItem[] = [
  { href: "/get-help", label: "Get Help" },
  { href: "/resources", label: "Find Resources" },
  { href: "/professionals", label: "For Professionals" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="bg-surface-raise border-b border-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link
          href="/"
          className="flex items-center min-h-11 no-underline"
          aria-label="Northeast Tennessee Reach — home"
        >
          <Image
            src="/NETN_REACH_wordmark.png"
            alt="Northeast Tennessee Reach"
            width={200}
            height={77}
            priority
            className="w-auto h-auto max-h-14"
          />
        </Link>
        <Link
          href="/get-help"
          className="flex items-center min-h-11 px-4 rounded-md bg-crisis text-white font-headline font-bold text-base no-underline hover:bg-crisis-hover"
        >
          Get Help Now
        </Link>
        <nav aria-label="Main" className="w-full sm:w-auto">
          <NavLinks items={NAV_ITEMS} />
        </nav>
      </div>
    </header>
  );
}
