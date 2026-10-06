/**
 * DEMO SEED — run once against the deployed schema v1.3.1.
 *
 * This loads the fixed lookup data (region, the 14 categories with the
 * source spreadsheet's exact names, the 7 plain-language topics and their
 * category mapping, the NETN-10 counties with Census-verified FIPS codes,
 * and the 4 crisis lines) plus THREE SAMPLE ORGANISATIONS so the pages
 * render. The real UID-master import replaces the organisations and
 * should treat categories/topics/counties as canonical.
 *
 * Run from web/:  npx tsx scripts/seed.ts
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (service-role key is used here only — never in the app).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- env ----

function loadEnv(): { url: string; serviceKey: string } {
  let url = process.env.SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // tsx doesn't read .env.local — parse it ourselves (no extra deps).
    try {
      const raw = readFileSync(join(process.cwd(), ".env.local"), "utf8");
      for (const line of raw.split("\n")) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const value = match[2].replace(/^["']|["']$/g, "");
        if (match[1] === "SUPABASE_URL") url ??= value;
        if (match[1] === "SUPABASE_SERVICE_ROLE_KEY") serviceKey ??= value;
      }
    } catch {
      // no .env.local — fall through to the error below
    }
  }
  if (!url || !serviceKey) {
    console.error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in web/.env.local).",
    );
    process.exit(1);
  }
  return { url, serviceKey };
}

const { url, serviceKey } = loadEnv();

// The network path to the project can reset long TLS streams; every seed
// write is idempotent (upsert / delete-then-insert), so retries are safe.
const retryFetch: typeof fetch = async (input, init) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fetch(input, init);
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  throw lastError;
};

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: retryFetch },
});

function fail(scope: string, error: { message: string; details?: string | null; hint?: string | null } | null): never {
  console.error(`✗ ${scope}: ${error?.message ?? "unknown error"}`);
  if (error?.details) console.error(`  ${error.details}`);
  if (error?.hint) console.error(`  ${error.hint}`);
  process.exit(1);
}

// ------------------------------------------------------------ fixed data --
// Category names are EXACTLY as the source spreadsheet spells them
// (14 tick-box columns; Recovery High Schools is the empty one).

const CATEGORIES: { slug: string; name: string; legacy_prefix?: string }[] = [
  { slug: "advocacy-organizations", name: "Advocacy Organizations", legacy_prefix: "AO" },
  { slug: "collegiate-recovery-programs", name: "Collegiate Recovery Programs", legacy_prefix: "CRP" },
  { slug: "drug-recovery-courts", name: "Drug/Recovery Courts" },
  { slug: "harm-reduction-organizations", name: "Harm Reduction Organizations" },
  { slug: "mutual-aid-organizations", name: "Mutual-Aid Organizations" },
  { slug: "peer-recovery-services", name: "Peer Recovery Services", legacy_prefix: "PRS" },
  { slug: "prevention-organizations", name: "Prevention Organizations" },
  { slug: "recovery-community-centers", name: "Recovery Community Centers" },
  { slug: "recovery-community-organizations", name: "Recovery Community Organizations", legacy_prefix: "RCO" },
  { slug: "recovery-high-schools", name: "Recovery High Schools" },
  { slug: "recovery-informed-institutional-services", name: "Recovery Informed Institutional Services" },
  { slug: "recovery-residences", name: "Recovery Residences", legacy_prefix: "RR" },
  { slug: "re-entry-services-organizations", name: "Re-Entry Services Organizations" },
  { slug: "treatment-services", name: "Treatment Services", legacy_prefix: "TS" },
];

// Plain-language topics → categories (proposal §4 mapping).
const TOPICS: {
  slug: string;
  label: string;
  description: string;
  categories: string[];
}[] = [
  {
    slug: "a-place-to-stay",
    label: "A place to stay",
    description: "Recovery residences — supportive, substance-free housing.",
    categories: ["recovery-residences"],
  },
  {
    slug: "meetings-near-me",
    label: "Meetings near me",
    description: "Mutual-aid groups: AA, NA, Al-Anon, and other fellowships.",
    categories: ["mutual-aid-organizations"],
  },
  {
    slug: "detox-and-treatment",
    label: "Detox and treatment",
    description: "Detox, outpatient counseling, and medication for opioid or alcohol use.",
    categories: ["treatment-services"],
  },
  {
    slug: "someone-to-talk-to",
    label: "Someone to talk to",
    description: "Peer recovery specialists and recovery community centers.",
    categories: ["peer-recovery-services", "recovery-community-centers"],
  },
  {
    slug: "staying-safe",
    label: "Staying safe",
    description: "Harm reduction: naloxone, syringe services, overdose education.",
    categories: ["harm-reduction-organizations"],
  },
  {
    slug: "help-with-court-or-re-entry",
    label: "Help with court or re-entry",
    description: "Recovery courts and re-entry support after incarceration.",
    categories: ["drug-recovery-courts", "re-entry-services-organizations"],
  },
  {
    slug: "help-at-school",
    label: "Help at school or college",
    description: "Collegiate recovery programs and recovery high schools.",
    categories: ["collegiate-recovery-programs", "recovery-high-schools"],
  },
];

// NETN-10 counties, FIPS verified against the Census list.
const COUNTIES: { fips: string; name: string }[] = [
  { fips: "47019", name: "Carter" },
  { fips: "47029", name: "Cocke" },
  { fips: "47059", name: "Greene" },
  { fips: "47063", name: "Hamblen" },
  { fips: "47067", name: "Hancock" },
  { fips: "47073", name: "Hawkins" },
  { fips: "47091", name: "Johnson" },
  { fips: "47163", name: "Sullivan" },
  { fips: "47171", name: "Unicoi" },
  { fips: "47179", name: "Washington" },
];

const CRISIS_LINES: {
  slug: string;
  label: string;
  phone: string;
  description: string;
  sort_order: number;
}[] = [
  {
    slug: "tn-redline",
    label: "TN REDLINE",
    phone: "800-889-9789",
    description:
      "Statewide, confidential help with substance use — calls and texts answered 24/7, in English and Spanish.",
    sort_order: 10,
  },
  {
    slug: "988",
    label: "988 Suicide & Crisis Lifeline",
    phone: "988",
    description:
      "Call, text, or chat 988 — 24/7 support for mental health or substance use crises, for you or someone you know.",
    sort_order: 20,
  },
  {
    slug: "statewide-crisis-line",
    label: "Statewide Crisis Line",
    phone: "855-274-7471",
    description:
      "Tennessee's statewide crisis line, answered 24/7 — connects you to mobile crisis services in your area.",
    sort_order: 30,
  },
  {
    slug: "911",
    label: "911",
    phone: "911",
    description:
      "For medical emergencies, including overdose. A 911 call can bring a police response as well as an ambulance — one reason people hesitate to call during an overdose. When you call for help during an overdose, Tennessee law can protect you from certain drug charges, and naloxone is safe to give even if opioids are not the cause.",
    sort_order: 40,
  },
];

// Three SAMPLE organisations (status 'published') so the pages render.
// Replaced wholesale by the real UID-master import.
type SampleOrg = {
  slug: string;
  name: string;
  description: string;
  website?: string;
  public_phone?: string;
  public_email?: string;
  categories: { slug: string; primary?: boolean }[];
  location?: {
    address_line1: string;
    city: string;
    state_code: string;
    postal_code: string;
    county_fips: string;
  };
  hours: { day: string; opens: string; closes: string }[];
  service_areas: { fips: string; phone?: string }[];
};

const SAMPLE_ORGS: SampleOrg[] = [
  {
    slug: "mountain-empire-recovery-community-center",
    name: "Mountain Empire Recovery Community Center",
    description:
      "A recovery community center where people in or seeking recovery can find free peer support, all-recovery meetings, recovery coaching, and help connecting to treatment, housing, and community resources. Family and friends are welcome to drop in and ask questions.",
    website: "https://example.org/mountain-empire-rcc",
    public_phone: "(423) 555-0142",
    public_email: "info@example.org",
    categories: [
      { slug: "recovery-community-centers", primary: true },
      { slug: "peer-recovery-services" },
    ],
    location: {
      address_line1: "100 W Market Street",
      city: "Johnson City",
      state_code: "TN",
      postal_code: "37604",
      county_fips: "47179",
    },
    hours: [
      { day: "monday", opens: "09:00", closes: "17:00" },
      { day: "tuesday", opens: "09:00", closes: "17:00" },
      { day: "wednesday", opens: "09:00", closes: "17:00" },
      { day: "thursday", opens: "09:00", closes: "17:00" },
      { day: "friday", opens: "09:00", closes: "17:00" },
    ],
    service_areas: [
      { fips: "47179" },
      { fips: "47019" },
      { fips: "47163" },
      { fips: "47171" },
      { fips: "47091" },
    ],
  },
  {
    slug: "watauga-treatment-services",
    name: "Watauga Treatment Services",
    description:
      "Outpatient treatment for people with opioid or alcohol use disorders, including medication (buprenorphine, methadone, naltrexone), individual counseling, and group therapy. Serves all of Northeast Tennessee regardless of ability to pay.",
    website: "https://example.org/watauga-treatment",
    public_phone: "(423) 555-0175",
    categories: [{ slug: "treatment-services", primary: true }],
    location: {
      address_line1: "2101 N Roan Street",
      city: "Johnson City",
      state_code: "TN",
      postal_code: "37601",
      county_fips: "47179",
    },
    hours: [
      { day: "monday", opens: "08:00", closes: "18:00" },
      { day: "tuesday", opens: "08:00", closes: "18:00" },
      { day: "wednesday", opens: "08:00", closes: "18:00" },
      { day: "thursday", opens: "08:00", closes: "18:00" },
      { day: "friday", opens: "08:00", closes: "18:00" },
      { day: "saturday", opens: "09:00", closes: "13:00" },
    ],
    service_areas: COUNTIES.map(({ fips }) => ({ fips })),
  },
  {
    slug: "northeast-peer-link",
    name: "Northeast Peer Link",
    description:
      "Certified peer recovery specialists covering every county in the region. A peer specialist — a person in long-term recovery — can talk with you or a family member about substance use, help you plan the next step, and go with you to a first appointment. No office and no waitlist: reach the specialist for your county by phone.",
    public_phone: "(423) 555-0188",
    categories: [{ slug: "peer-recovery-services", primary: true }],
    location: undefined, // coverage-only: demonstrates the county-served band
    hours: [
      { day: "monday", opens: "08:00", closes: "20:00" },
      { day: "tuesday", opens: "08:00", closes: "20:00" },
      { day: "wednesday", opens: "08:00", closes: "20:00" },
      { day: "thursday", opens: "08:00", closes: "20:00" },
      { day: "friday", opens: "08:00", closes: "16:00" },
    ],
    service_areas: COUNTIES.map(({ fips }) => ({
      fips,
      phone:
        fips === "47019" || fips === "47091"
          ? "(423) 555-0134"
          : "(423) 555-0188",
    })),
  },
];

// ---------------------------------------------------------------- seed ----

type Row = Record<string, unknown>;

async function upsert(
  table: string,
  rows: Row[],
  onConflict: string,
): Promise<Row[]> {
  const { data, error } = await db
    .from(table)
    .upsert(rows as never, { onConflict, ignoreDuplicates: true })
    .select();
  if (error) fail(`upsert ${table}`, error);
  return (data ?? []) as Row[];
}

async function idMap(
  table: string,
  eq: { column: string; value: number | string },
): Promise<Map<string, number>> {
  const { data, error } = await db
    .from(table)
    .select("id, slug")
    .eq(eq.column, eq.value);
  if (error) fail(`read ${table}`, error);
  return new Map((data ?? []).map((r: { id: number; slug: string }) => [r.slug, r.id]));
}

async function main() {
  console.log("REACH demo seed — the real import replaces the sample orgs.\n");

  // 1. Region (upsert returns empty on an existing row with
  // ignoreDuplicates, so fetch it in that case)
  const regionRows = await upsert(
    "regions",
    [{ slug: "netn-reach", name: "Northeast Tennessee REACH", settings: {} }],
    "slug",
  );
  let region = regionRows[0] as { id: number } | undefined;
  if (!region) {
    const { data, error } = await db
      .from("regions")
      .select("id")
      .eq("slug", "netn-reach")
      .single();
    if (error || !data) fail("region lookup", error);
    region = data as { id: number };
  }
  const regionId = region.id;
  console.log(`✓ region netn-reach (id ${regionId})`);

  // 2. Categories (exact source names)
  await upsert(
    "categories",
    CATEGORIES.map((c, i) => ({
      region_id: regionId,
      slug: c.slug,
      name: c.name,
      legacy_prefix: c.legacy_prefix ?? null,
      sort_order: (i + 1) * 10,
    })),
    "region_id,slug",
  );
  const catBySlug = await idMap("categories", { column: "region_id", value: regionId });
  console.log(`✓ ${CATEGORIES.length} categories`);

  // 3. Plain-language topics + mapping
  await upsert(
    "plain_language_topics",
    TOPICS.map((t, i) => ({
      region_id: regionId,
      slug: t.slug,
      label: t.label,
      description: t.description,
      sort_order: (i + 1) * 10,
    })),
    "region_id,slug",
  );
  const topicBySlug = await idMap("plain_language_topics", { column: "region_id", value: regionId });
  const links = TOPICS.flatMap((t) =>
    t.categories.map((catSlug) => ({
      topic_id: topicBySlug.get(t.slug)!,
      category_id: catBySlug.get(catSlug)!,
    })),
  );
  await db.from("topic_categories").upsert(links, {
    onConflict: "topic_id,category_id",
    ignoreDuplicates: true,
  }).then(({ error }) => {
    if (error) fail("topic_categories", error);
  });
  console.log(`✓ ${TOPICS.length} topics, ${links.length} topic↔category links`);

  // 4. Counties (Census-verified FIPS, in_region = true)
  await upsert(
    "counties",
    COUNTIES.map((c) => ({
      fips: c.fips,
      name: c.name,
      state_code: "TN",
      in_region: true,
      region_id: regionId,
    })),
    "fips",
  );
  console.log(`✓ ${COUNTIES.length} counties in region`);

  // 5. Crisis lines (verified_on stays NULL until pre-launch re-verification)
  await upsert(
    "crisis_lines",
    CRISIS_LINES.map((l) => ({
      region_id: regionId,
      slug: l.slug,
      label: l.label,
      phone: l.phone,
      description: l.description,
      is_24_7: true,
      sort_order: l.sort_order,
    })),
    "region_id,slug",
  );
  console.log(`✓ ${CRISIS_LINES.length} crisis lines`);

  // 6. Sample organisations
  for (const org of SAMPLE_ORGS) {
    const { data: orgRow, error: orgError } = await db
      .from("organisations")
      .upsert(
        {
          region_id: regionId,
          slug: org.slug,
          name: org.name,
          kind: "service",
          description: org.description,
          website: org.website ?? null,
          public_phone: org.public_phone ?? null,
          public_email: org.public_email ?? null,
          status: "published",
          last_verified_on: "2026-07-01",
          legacy_uids: [`SEED:${org.slug}`], // provenance marker: demo seed
        },
        { onConflict: "region_id,slug", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (orgError) fail(`organisation ${org.slug}`, orgError);
    let orgId = orgRow?.id;
    if (!orgId) {
      const { data: existing, error: lookupErr } = await db
        .from("organisations")
        .select("id")
        .eq("region_id", regionId)
        .eq("slug", org.slug)
        .single();
      if (lookupErr || !existing) fail(`organisation lookup ${org.slug}`, lookupErr);
      orgId = existing.id;
    }

    // categories
    const catRows = org.categories.map((c) => ({
      organisation_id: orgId,
      category_id: catBySlug.get(c.slug)!,
      is_primary: Boolean(c.primary),
    }));
    const { error: catErr } = await db
      .from("organisation_categories")
      .upsert(catRows, { onConflict: "organisation_id,category_id", ignoreDuplicates: true });
    if (catErr) fail(`organisation_categories ${org.slug}`, catErr);

    // location (lookup-or-insert: the unique key is an expression index)
    let locationId: number | null = null;
    if (org.location) {
      const { data: existing } = await db
        .from("locations")
        .select("id")
        .ilike("address_line1", org.location.address_line1)
        .ilike("city", org.location.city)
        .maybeSingle();
      locationId = existing?.id ?? null;
      if (!locationId) {
        const { data: locRow, error: locErr } = await db
          .from("locations")
          .insert({
            region_id: regionId,
            address_line1: org.location.address_line1,
            city: org.location.city,
            state_code: org.location.state_code,
            postal_code: org.location.postal_code,
            county_fips: org.location.county_fips,
          })
          .select("id")
          .single();
        if (locErr) fail(`location ${org.slug}`, locErr);
        locationId = locRow.id;
      }
      const { error: linkErr } = await db
        .from("organisation_locations")
        .upsert(
          { organisation_id: orgId, location_id: locationId, is_primary: true },
          { onConflict: "organisation_id,location_id", ignoreDuplicates: true },
        );
      if (linkErr) fail(`organisation_locations ${org.slug}`, linkErr);
    }

    // hours (replace for idempotency)
    const { error: delErr } = await db
      .from("organisation_hours")
      .delete()
      .eq("organisation_id", orgId);
    if (delErr) fail(`organisation_hours delete ${org.slug}`, delErr);
    if (org.hours.length > 0) {
      const { error: hoursErr } = await db.from("organisation_hours").insert(
        org.hours.map((h) => ({
          organisation_id: orgId,
          location_id: locationId,
          day_of_week: h.day,
          opens: h.opens,
          closes: h.closes,
          verified_on: "2026-07-01",
        })),
      );
      if (hoursErr) fail(`organisation_hours insert ${org.slug}`, hoursErr);
    }

    // service areas
    const saRows = org.service_areas.map((sa) => ({
      organisation_id: orgId,
      county_fips: sa.fips,
      public_phone: sa.phone ?? null,
    }));
    const { error: saErr } = await db
      .from("service_areas")
      .upsert(saRows, { onConflict: "organisation_id,county_fips", ignoreDuplicates: true });
    if (saErr) fail(`service_areas ${org.slug}`, saErr);

    console.log(
      `✓ org “${org.name}” — ${catRows.length} categories, ${
        locationId ? "1 location" : "no location (county band)"
      }, ${org.hours.length} hour rows, ${saRows.length} service areas`,
    );
  }

  console.log(
    "\nDone. Sample orgs carry legacy_uids ['SEED:<slug>'] — the real import replaces them.",
  );
}

main();
