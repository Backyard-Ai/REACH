import type { Metadata } from "next";
import {
  League_Spartan,
  Merriweather,
  Source_Sans_3,
  Satisfy,
} from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import "./globals.css";

const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  weight: "700",
  variable: "--font-league-spartan",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-merriweather",
  display: "swap",
});

const sourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans-3",
  display: "swap",
});

const satisfy = Satisfy({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-satisfy",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${leagueSpartan.variable} ${merriweather.variable} ${sourceSans3.variable} ${satisfy.variable} h-full antialiased`}
    >
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
