"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex items-center min-h-11 px-3 rounded-md text-base font-semibold text-text-body no-underline hover:text-brand-primary hover:bg-surface focus-visible:bg-surface aria-current-page:text-brand-primary aria-current-page:underline aria-current-page:decoration-brand-accent aria-current-page:decoration-2 aria-current-page:underline-offset-8"
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
