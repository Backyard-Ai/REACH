import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

/*
 * Brand typefaces load from the Google Fonts CDN at runtime (from the
 * visitor's browser) rather than via next/font/google, which downloads
 * files at dev/build time and breaks local dev when fonts.gstatic.com is
 * unreachable. Family stacks are mapped in globals.css @theme.
 */
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=League+Spartan:wght@700&family=Merriweather:ital,wght@0,400;0,700;1,400&family=Source+Sans+3:ital,wght@0,400..900;1,400..900&family=Satisfy&display=swap";

export const metadata: Metadata = {
  title: {
    default: "Northeast Tennessee Reach — recovery resource directory",
    template: "%s · Northeast Tennessee Reach",
  },
  description:
    "Find recovery support across ten Northeast Tennessee counties: crisis lines, treatment, mutual-aid meetings, recovery residences, and peer support.",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body className="min-h-full flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-brand-primary focus:text-white focus:px-4 focus:py-3 focus:rounded-md focus:min-h-11 focus:flex focus:items-center"
        >
          Skip to main content
        </a>
        <SiteHeader />
        <main
          id="main-content"
          className="flex-1 w-full"
          tabIndex={-1}
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
