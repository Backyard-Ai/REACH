// =====================================================================
// Supabase Edge Function: reach-kb
// Northeast Tennessee REACH — knowledge pages for the CustomGPT.ai bots
// Version 1.0 · 28 Oct 2026 · Backyard-AI
//
// WHAT IT DOES
//   Turns the REACH directory's PUBLISHED data into plain-text pages plus
//   one sitemap. Both REACH chatbots (Community and Professional) use the
//   same sitemap, so they share one knowledge base.
//
// ROUTES  (BASE = https://<project-ref>.supabase.co/functions/v1/reach-kb)
//   BASE/sitemap.xml          the sitemap you give CustomGPT
//   BASE/resource/<slug>      one page per published service
//   BASE/meeting/<slug>       one page per published meeting
//   BASE/county/<fips>        what serves / meets in each county
//   BASE/get-help-now         crisis lines
//   BASE/guide                topics, categories and search terms
//   BASE/                     plain list of every page
//
// SAFETY
//   * Read-only. It only ever sends GET requests to the database API, with
//     the PUBLIC (anon) key, so it sees exactly what the public website
//     sees: published listings only. Row-level security does the rest.
//   * It never reads contacts, practitioner notes, submissions, source
//     records or import runs (they are blocked for the public key anyway).
//   * The function itself only answers GET/HEAD; there is no write path.
//
// SETUP (no secrets needed)
//   Supabase provides SUPABASE_URL and SUPABASE_ANON_KEY to every Edge
//   Function automatically. Optional overrides:
//     KB_DB_KEY            use this public key instead of SUPABASE_ANON_KEY
//     KB_PUBLIC_BASE_URL   the public address of this function, if different
//   JWT verification must be OFF for this function so CustomGPT's crawler
//   can read it without a login.
//
// Pages are plain text: without a Supabase custom domain, Supabase serves
// HTML as text/plain anyway, and the chatbots only need the words.
// =====================================================================

const FUNCTION_NAME = "reach-kb";
const CACHE_SECONDS = 600; // re-read the database at most every 10 minutes
const PAGE_LIMIT = 1000;   // matches Supabase's default API row cap

// ---------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
const G = globalThis as any;
function env(name: string): string | undefined {
  return G.Deno?.env?.get(name) ?? G.process?.env?.[name];
}
const SUPABASE_URL = (env("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const DB_KEY = env("KB_DB_KEY") ?? env("SUPABASE_ANON_KEY") ?? "";
const BASE = (env("KB_PUBLIC_BASE_URL") ?? `${SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`)
  .replace(/\/+$/, "");

// ---------------------------------------------------------------------
// Types (only the fields this function reads)
// ---------------------------------------------------------------------
type Loc = {
  location_id: number; address: string | null; city: string | null;
  state: string | null; postal_code: string | null;
};
type Coverage = { county: string; fips: string; phone: string | null };
type Hours = { day: string; opens: string; closes: string; note: string | null; verified_on: string | null };
type Resource = {
  id: number; slug: string; name: string; kind: "service" | "meeting_group";
  parent_id: number | null; description: string | null; website: string | null;
  public_phone: string | null; public_email: string | null; last_verified_on: string | null;
  categories: string[]; attributes: Record<string, string[]>;
  counties_served: string[]; county_coverage: Coverage[]; locations: Loc[]; hours: Hours[];
};
type Sitting = { day: string; start: string; weeks_of_month: number[] | null };
type Meeting = {
  slug: string; meeting_name: string; fellowship: string | null; room: string | null;
  organisation_slug: string; organisation_name: string;
  address_line1: string | null; city: string | null; state_code: string | null;
  postal_code: string | null; type_codes: string[]; schedule: Sitting[];
};
type County = { fips: string; name: string; state_code: string; in_region: boolean };
type CrisisLine = { label: string; phone: string; description: string | null; url: string | null; is_24_7: boolean; verified_on: string | null };
type Topic = { id: number; slug: string; label: string; description: string | null };
type Category = { id: number; slug: string; name: string; definition: string | null };
type Synonym = { term: string; category_id: number | null; topic_id: number | null };

type Data = {
  resources: Resource[]; meetings: Meeting[]; counties: County[];
  crisis: CrisisLine[]; meetingTypes: Map<string, string>;
  topics: Topic[]; topicCategories: { topic_id: number; category_id: number }[];
  categories: Category[]; synonyms: Synonym[];
  orgUpdated: Map<number, string>;
  seriesInfo: Map<string, { location_id: number | null; updated_at: string }>;
  locationCounty: Map<number, string | null>;
  loadedAt: number;
};

// ---------------------------------------------------------------------
// Database reads — GET only, public key only
// ---------------------------------------------------------------------
async function getAll<T>(table: string, query: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_LIMIT) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${query}&limit=${PAGE_LIMIT}&offset=${offset}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const batch = (await res.json()) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_LIMIT) break;
  }
  return rows;
}

let cache: Data | null = null;
let loading: Promise<Data> | null = null;

async function loadData(): Promise<Data> {
  if (cache && Date.now() - cache.loadedAt < CACHE_SECONDS * 1000) return cache;
  if (loading) return loading;
  loading = (async () => {
    const [resources, meetings, orgs, series, locations, counties, crisis, mtypes,
           topics, topicCategories, categories, synonyms] = await Promise.all([
      getAll<Resource>("published_resources", "select=*&order=name"),
      getAll<Meeting>("published_meetings", "select=*&order=meeting_name"),
      getAll<{ id: number; updated_at: string }>("organisations", "select=id,updated_at&status=eq.published"),
      getAll<{ slug: string; location_id: number | null; updated_at: string }>(
        "meeting_series", "select=slug,location_id,updated_at&status=eq.published"),
      getAll<{ id: number; county_fips: string | null }>("locations", "select=id,county_fips"),
      getAll<County>("counties", "select=fips,name,state_code,in_region&order=name"),
      getAll<CrisisLine>("crisis_lines",
        "select=label,phone,description,url,is_24_7,verified_on&is_active=eq.true&order=sort_order"),
      getAll<{ code: string; label: string }>("meeting_types", "select=code,label"),
      getAll<Topic>("plain_language_topics", "select=id,slug,label,description&is_active=eq.true&order=sort_order"),
      getAll<{ topic_id: number; category_id: number }>("topic_categories", "select=topic_id,category_id"),
      getAll<Category>("categories", "select=id,slug,name,definition&is_active=eq.true&order=sort_order"),
      getAll<Synonym>("search_synonyms", "select=term,category_id,topic_id&order=term"),
    ]);
    cache = {
      resources, meetings, counties, crisis, topics, topicCategories, categories, synonyms,
      meetingTypes: new Map(mtypes.map((m) => [m.code, m.label])),
      orgUpdated: new Map(orgs.map((o) => [o.id, o.updated_at])),
      seriesInfo: new Map(series.map((s) => [s.slug, { location_id: s.location_id, updated_at: s.updated_at }])),
      locationCounty: new Map(locations.map((l) => [l.id, l.county_fips])),
      loadedAt: Date.now(),
    };
    return cache;
  })();
  try {
    return await loading;
  } finally {
    loading = null;
  }
}

// ---------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------
const DAY_NAMES: Record<string, string> = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday", saturday: "Saturday",
};
const ATTRIBUTE_LABELS: Record<string, string> = {
  access: "Accessibility", population: "Populations served", payment: "Payment accepted",
  service_type: "Service types", language: "Languages", level_of_care: "Level of care",
  eligibility: "Eligibility",
};
const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th"];
const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function time12(t: string): string {
  const [hh, mm] = t.split(":").map(Number);
  const suffix = hh >= 12 ? "PM" : "AM";
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${String(mm).padStart(2, "0")} ${suffix}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sittingText(s: Sitting): string {
  const day = DAY_NAMES[s.day] ?? s.day;
  const when = `at ${time12(s.start)}`;
  if (!s.weeks_of_month || s.weeks_of_month.length === 0) return `Every ${day} ${when}`;
  const weeks = joinList(s.weeks_of_month.map((w) => ORDINALS[w] ?? String(w)));
  return `${weeks} ${day} of the month ${when}`;
}

function address(parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p && String(p).trim()).join(", ");
}

function countyName(d: Data, fips: string | null | undefined): string | null {
  if (!fips) return null;
  const c = d.counties.find((x) => x.fips === fips);
  if (!c) return null;
  return c.name.toLowerCase().endsWith("city") ? `${c.name}, ${c.state_code}` : `${c.name} County, ${c.state_code}`;
}

function notListed(label: string): string {
  return `${label}: not listed in the directory.`;
}

const FOOTER =
  "Source: Northeast Tennessee REACH resource directory (published listings only). " +
  "Details can change; call ahead to confirm hours, eligibility and cost.";

// ---------------------------------------------------------------------
// Page builders
// ---------------------------------------------------------------------
function resourcePage(d: Data, r: Resource): string {
  const L: string[] = [];
  L.push(`${r.name}`);
  L.push(`Northeast Tennessee REACH directory listing`);
  L.push("");
  L.push(`Name: ${r.name}`);
  L.push(`Category: ${r.categories.length ? r.categories.join("; ") : "not listed"}`);
  if (r.parent_id) {
    const parent = d.resources.find((x) => x.id === r.parent_id);
    if (parent) L.push(`Part of: ${parent.name}`);
  }
  L.push("");
  L.push("About");
  L.push(r.description?.trim() || "No description is listed in the directory.");
  L.push("");
  L.push("How to reach them");
  L.push(r.public_phone ? `Phone: ${r.public_phone}` : notListed("Main phone"));
  if (r.public_email) L.push(`Email: ${r.public_email}`);
  L.push(r.website ? `Website: ${r.website}` : notListed("Website"));
  const countyPhones = r.county_coverage.filter((c) => c.phone);
  if (countyPhones.length) {
    L.push("Phone numbers by county:");
    for (const c of countyPhones) L.push(`- ${c.county} County: ${c.phone}`);
  }
  L.push("");
  L.push("Where");
  if (r.locations.length) {
    for (const l of r.locations) {
      const cn = countyName(d, d.locationCounty.get(l.location_id));
      L.push(`- ${address([l.address, l.city, [l.state, l.postal_code].filter(Boolean).join(" ")])}${cn ? ` (${cn})` : ""}`);
    }
  } else {
    L.push("No physical address is listed. This program serves the counties below without an office address in the directory.");
  }
  L.push(r.counties_served.length
    ? `Counties served: ${joinList(r.counties_served)}`
    : notListed("Counties served"));
  L.push("");
  L.push("Hours");
  if (r.hours.length) {
    for (const h of r.hours) {
      L.push(`- ${DAY_NAMES[h.day] ?? h.day}: ${time12(h.opens)} to ${time12(h.closes)}${h.note ? ` (${h.note})` : ""}`);
    }
  } else {
    L.push("Hours are not listed in the directory.");
  }
  L.push("");
  L.push("Details");
  const kinds = Object.keys(ATTRIBUTE_LABELS);
  const listed = kinds.filter((k) => r.attributes?.[k]?.length);
  for (const k of listed) L.push(`${ATTRIBUTE_LABELS[k]}: ${r.attributes[k].join(", ")}`);
  const missing = kinds.filter((k) => !listed.includes(k)).map((k) => ATTRIBUTE_LABELS[k].toLowerCase());
  if (missing.length) L.push(`Not listed in the directory: ${joinList(missing)}.`);
  L.push("");
  L.push(`Last verified: ${r.last_verified_on ?? "not recorded"}`);
  L.push(FOOTER);
  return L.join("\n") + "\n";
}

function meetingPage(d: Data, m: Meeting): string {
  const group = d.resources.find((x) => x.slug === m.organisation_slug);
  const info = d.seriesInfo.get(m.slug);
  const cn = countyName(d, info?.location_id ? d.locationCounty.get(info.location_id) : null);
  const formats = m.type_codes.map((c) => d.meetingTypes.get(c) ?? c);
  const L: string[] = [];
  L.push(`${m.meeting_name}${m.city ? ` (${m.city})` : ""}`);
  L.push(`Northeast Tennessee REACH directory: mutual-aid meeting`);
  L.push("");
  L.push(`Meeting: ${m.meeting_name}`);
  if (m.fellowship) L.push(`Fellowship: ${m.fellowship}`);
  L.push(`Held by: ${m.organisation_name}`);
  L.push(formats.length ? `Meeting type: ${formats.join(", ")}` : notListed("Meeting type"));
  L.push("");
  L.push("When (Eastern Time)");
  if (m.schedule.length) {
    for (const s of m.schedule) L.push(`- ${sittingText(s)}`);
  } else {
    L.push("No day or time is listed in the directory. Contact the group to confirm when it meets.");
  }
  L.push("");
  L.push("Where");
  const addr = address([m.address_line1, m.city, [m.state_code, m.postal_code].filter(Boolean).join(" ")]);
  L.push(addr ? `${addr}${cn ? ` (${cn})` : ""}` : "No address is listed in the directory.");
  if (m.room) L.push(`Room: ${m.room}`);
  L.push("");
  L.push("About the group");
  L.push(group?.description?.trim() || "No description is listed in the directory.");
  if (group?.website) L.push(`Website: ${group.website}`);
  if (group?.public_phone) L.push(`Phone: ${group.public_phone}`);
  if (group?.public_email) L.push(`Email: ${group.public_email}`);
  L.push("");
  L.push(`Last verified: ${group?.last_verified_on ?? "not recorded"}`);
  L.push(FOOTER);
  return L.join("\n") + "\n";
}

function countyPage(d: Data, c: County): string {
  const name = countyName(d, c.fips)!;
  const services = d.resources.filter((r) =>
    r.kind === "service" &&
    (r.county_coverage.some((x) => x.fips === c.fips) ||
     r.locations.some((l) => d.locationCounty.get(l.location_id) === c.fips)));
  const meetings = d.meetings.filter((m) => {
    const info = d.seriesInfo.get(m.slug);
    return info?.location_id ? d.locationCounty.get(info.location_id) === c.fips : false;
  });
  const L: string[] = [];
  L.push(`Recovery resources in ${name}`);
  L.push(`Northeast Tennessee REACH directory${c.in_region ? "" : " (outside the 10-county REACH region; listed because some programs serve it)"}`);
  L.push("");
  L.push(`Services that serve ${name} (${services.length})`);
  if (!services.length) L.push("None listed.");
  for (const r of services) {
    const phone = r.county_coverage.find((x) => x.fips === c.fips)?.phone ?? r.public_phone;
    const hasOffice = r.locations.some((l) => d.locationCounty.get(l.location_id) === c.fips);
    L.push(`- ${r.name} (${r.categories.join("; ") || "uncategorized"})` +
      `${hasOffice ? "; has an address in this county" : "; serves this county, no address here"}` +
      `${phone ? `; phone ${phone}` : ""}. Details: ${BASE}/resource/${r.slug}`);
  }
  L.push("");
  L.push(`Mutual-aid meetings held in ${name} (${meetings.length})`);
  if (!meetings.length) L.push("None listed.");
  for (const m of meetings) {
    const when = m.schedule.length ? m.schedule.map(sittingText).join("; ") : "day and time not listed";
    L.push(`- ${m.meeting_name}${m.fellowship ? ` (${m.fellowship})` : ""}, ${m.city ?? ""}: ${when}. Details: ${BASE}/meeting/${m.slug}`);
  }
  L.push("");
  L.push(FOOTER);
  return L.join("\n") + "\n";
}

function helpNowPage(d: Data): string {
  const L: string[] = [];
  L.push("Get help now: crisis and emergency lines");
  L.push("Northeast Tennessee REACH directory");
  L.push("");
  for (const c of d.crisis) {
    L.push(`${c.label}: ${c.phone}${c.is_24_7 ? " (24/7)" : ""}`);
    if (c.description) L.push(c.description);
    if (c.url) L.push(`Website: ${c.url}`);
    L.push(`Last verified: ${c.verified_on ?? "not recorded"}`);
    L.push("");
  }
  L.push(FOOTER);
  return L.join("\n") + "\n";
}

function guidePage(d: Data): string {
  const cat = new Map(d.categories.map((c) => [c.id, c.name]));
  const top = new Map(d.topics.map((t) => [t.id, t.label]));
  const L: string[] = [];
  L.push("How the Northeast Tennessee REACH directory is organized");
  L.push("");
  const region = d.counties.filter((c) => c.in_region).map((c) => c.name).sort();
  L.push(`The directory lists ${d.resources.filter((r) => r.kind === "service").length} services and ` +
    `${d.meetings.length} mutual-aid meetings` +
    (region.length ? ` across ${joinList(region)} counties in Northeast Tennessee.` : "."));
  L.push("");
  L.push("Plain-language topics and the categories they include");
  for (const t of d.topics) {
    const cats = d.topicCategories.filter((x) => x.topic_id === t.id).map((x) => cat.get(x.category_id)).filter(Boolean);
    L.push(`- ${t.label}${cats.length ? `: ${cats.join("; ")}` : ""}${t.description ? `. ${t.description}` : ""}`);
  }
  L.push("");
  L.push("Categories");
  for (const c of d.categories) L.push(`- ${c.name}${c.definition ? `: ${c.definition}` : ""}`);
  L.push("");
  L.push("Other words people use, and where they lead");
  for (const s of d.synonyms) {
    const target = s.category_id ? cat.get(s.category_id) : s.topic_id ? top.get(s.topic_id) : null;
    if (target) L.push(`- "${s.term}" means ${target}`);
  }
  L.push("");
  L.push(`Crisis lines: ${BASE}/get-help-now`);
  L.push(FOOTER);
  return L.join("\n") + "\n";
}

// ---------------------------------------------------------------------
// Sitemap and index
// ---------------------------------------------------------------------
type PageRef = { path: string; title: string; lastmod: string };

function pageList(d: Data): PageRef[] {
  const latest = [...d.orgUpdated.values(), ...[...d.seriesInfo.values()].map((s) => s.updated_at)]
    .sort().at(-1) ?? new Date().toISOString();
  const pages: PageRef[] = [
    { path: "get-help-now", title: "Get help now: crisis lines", lastmod: latest },
    { path: "guide", title: "How the directory is organized", lastmod: latest },
  ];
  const usedCounties = new Set<string>();
  for (const r of d.resources) for (const c of r.county_coverage) usedCounties.add(c.fips);
  for (const fips of d.locationCounty.values()) if (fips) usedCounties.add(fips);
  for (const c of d.counties) {
    if (c.in_region || usedCounties.has(c.fips)) {
      pages.push({ path: `county/${c.fips}`, title: `Resources in ${countyName(d, c.fips)}`, lastmod: latest });
    }
  }
  for (const r of d.resources) {
    if (r.kind !== "service" || !SAFE_SLUG.test(r.slug)) continue;
    pages.push({ path: `resource/${r.slug}`, title: r.name, lastmod: d.orgUpdated.get(r.id) ?? latest });
  }
  for (const m of d.meetings) {
    if (!SAFE_SLUG.test(m.slug)) continue;
    pages.push({ path: `meeting/${m.slug}`, title: m.meeting_name, lastmod: d.seriesInfo.get(m.slug)?.updated_at ?? latest });
  }
  return pages;
}

function xmlEscape(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function sitemap(d: Data): string {
  const urls = pageList(d).map((p) =>
    `  <url><loc>${xmlEscape(`${BASE}/${p.path}`)}</loc><lastmod>${new Date(p.lastmod).toISOString()}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// ---------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------
function text(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}

async function route(req: Request): Promise<Response> {
  if (!SUPABASE_URL || !DB_KEY) return text("Server not configured: SUPABASE_URL or public key missing.", 500);

  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const at = parts.indexOf(FUNCTION_NAME);
  const [section, slug, extra] = at >= 0 ? parts.slice(at + 1) : parts;
  if (extra !== undefined) return text("Not found", 404);

  const d = await loadData();

  if (!section) {
    const list = pageList(d).map((p) => `${p.title}: ${BASE}/${p.path}`).join("\n");
    return text(`Northeast Tennessee REACH directory: all knowledge pages\n\n${list}\n`);
  }
  if (section === "sitemap.xml" && !slug) {
    return new Response(sitemap(d), {
      headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
    });
  }
  if (section === "get-help-now" && !slug) return text(helpNowPage(d));
  if (section === "guide" && !slug) return text(guidePage(d));

  if (section === "resource" && slug && SAFE_SLUG.test(slug)) {
    const r = d.resources.find((x) => x.slug === slug && x.kind === "service");
    if (r) return text(resourcePage(d, r));
  }
  if (section === "meeting" && slug && SAFE_SLUG.test(slug)) {
    const m = d.meetings.find((x) => x.slug === slug);
    if (m) return text(meetingPage(d, m));
  }
  if (section === "county" && slug && /^[0-9]{5}$/.test(slug)) {
    const c = d.counties.find((x) => x.fips === slug);
    if (c) return text(countyPage(d, c));
  }
  return text("Not found", 404);
}

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
  }
  let res: Response;
  try {
    res = await route(req);
  } catch (err) {
    console.error("reach-kb error:", err);
    res = text("Temporary error. Please try again shortly.", 503);
  }
  return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
}

if (G.Deno?.serve) G.Deno.serve(handler);
