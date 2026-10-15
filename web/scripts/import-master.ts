/**
 * Phase 1 production importer — UID master spreadsheet → schema v1.3.1/v1.4.
 *
 * Rebuilds import_trial.py's validated transformation against the current
 * schema: organisations.kind, fully-private contacts, service-area public
 * phones, import_runs/source_records bookkeeping, and the approved
 * vanished-UID spec (draft + needs_review, never deleted, blast-radius
 * guard, reappearing UIDs never auto-republish — implemented for future
 * monthly runs; the first run has nothing to vanish).
 *
 * Usage:
 *   npx tsx scripts/import-master.ts --dry-run   parse + report only
 *   npx tsx scripts/import-master.ts             write to TARGET_DATABASE_URL
 *
 * Env (web/.env.local or environment):
 *   TARGET_DATABASE_URL  pg connection string (container or Supabase pooler)
 *   IMPORT_FILE          path to the xlsx (default: repo-root master file)
 *   DRY_RUN=1            same as --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import * as XLSX from "xlsx";

// ---------------------------------------------------------------- env ------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = readFileSync(join(REPO_ROOT, "web", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env.local */ }
  return out;
}
const ENV = loadEnv();
const DRY = process.argv.includes("--dry-run") || ENV.DRY_RUN === "1";
const FILE =
  process.argv.find((a) => a.startsWith("--file="))?.slice(7) ||
  ENV.IMPORT_FILE ||
  join(REPO_ROOT, "0_UIDMASTER_database_July 30_ idenififers.xlsx");
const TARGET = ENV.TARGET_DATABASE_URL;
if (!DRY && !TARGET) {
  console.error("TARGET_DATABASE_URL required for a real run (or use --dry-run)");
  process.exit(1);
}
if (!existsSync(FILE)) {
  console.error(`import file not found: ${FILE}`);
  process.exit(1);
}

// ------------------------------------------------------------- constants ---

const TN = "47";
// FIPS verified against the Census list (see import_trial.py / docs).
const NETN: Record<string, string> = {
  Carter: "019", Cocke: "029", Greene: "059", Hamblen: "063",
  Hancock: "067", Hawkins: "073", Johnson: "091", Sullivan: "163",
  Unicoi: "171", Washington: "179",
};
const NEIGHBOURS: Record<string, string> = {
  Grainger: "057", Jefferson: "089", Sevier: "155",
};
const COUNTY_FIPS: Record<string, string> = {};
for (const [n, c] of Object.entries(NETN)) COUNTY_FIPS[`${n}|TN`] = TN + c;
for (const [n, c] of Object.entries(NEIGHBOURS)) COUNTY_FIPS[`${n}|TN`] = TN + c;
// Bristol VA is an independent city — its own county-equivalent, never
// either Washington County.
COUNTY_FIPS["Washington|VA"] = "51520";

// Source categorization text is SINGULAR; the 14 categories are the
// spreadsheet's plural tick-box names (authoritative, already seeded).
const SINGULAR_TO_CATEGORY: Record<string, string> = {
  "Advocacy Organization": "Advocacy Organizations",
  "Collegiate Recovery Program": "Collegiate Recovery Programs",
  "Recovery/Drug Court": "Drug/Recovery Courts",
  "Harm Reduction Organization": "Harm Reduction Organizations",
  "Mutual-Aid Organization": "Mutual-Aid Organizations",
  "Peer Recovery Service": "Peer Recovery Services",
  "Prevention Organization": "Prevention Organizations",
  "Recovery Community Center": "Recovery Community Centers",
  "Recovery Community Organization": "Recovery Community Organizations",
  "Recovery High School": "Recovery High Schools",
  "Recovery Informed Institutional Service": "Recovery Informed Institutional Services",
  "Recovery Residence": "Recovery Residences",
  "Re-Entry Service Organization": "Re-Entry Services Organizations",
  "Treatment Service": "Treatment Services",
};

const CATEGORY_NAMES = new Set(Object.values(SINGULAR_TO_CATEGORY));
// hyphen/space-insensitive lookup: the source has one unhyphenated
// "Mutual Aid Organization" (the row where text and tick-box disagree)
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const CATEGORY_BY_NORM = new Map<string, string>([
  ...[...CATEGORY_NAMES].map((c): [string, string] => [norm(c), c]),
  ...Object.entries(SINGULAR_TO_CATEGORY).map(([k, v]): [string, string] => [norm(k), v]),
]);
const resolveCategory = (c: string): string | null =>
  SINGULAR_TO_CATEGORY[c] ?? CATEGORY_BY_NORM.get(norm(c)) ?? null;

const TOPICS: { slug: string; label: string; cats: string[] }[] = [
  { slug: "a-place-to-stay", label: "A place to stay", cats: ["Recovery Residences"] },
  { slug: "meetings-near-me", label: "Meetings near me", cats: ["Mutual-Aid Organizations"] },
  { slug: "detox-and-treatment", label: "Detox and treatment", cats: ["Treatment Services"] },
  { slug: "someone-to-talk-to", label: "Someone to talk to", cats: ["Peer Recovery Services", "Recovery Community Centers", "Recovery Community Organizations"] },
  { slug: "staying-safe", label: "Staying safe", cats: ["Harm Reduction Organizations"] },
  { slug: "help-with-court-or-re-entry", label: "Help with court or re-entry", cats: ["Drug/Recovery Courts", "Re-Entry Services Organizations"] },
  { slug: "help-at-school", label: "Help at school or college", cats: ["Collegiate Recovery Programs", "Recovery High Schools"] },
];

const SYNONYMS: [string, string][] = [
  ["suboxone", "Treatment Services"], ["methadone", "Treatment Services"],
  ["detox", "Treatment Services"], ["rehab", "Treatment Services"],
  ["mat", "Treatment Services"],
  ["aa", "Mutual-Aid Organizations"], ["na", "Mutual-Aid Organizations"],
  ["alcoholics anonymous", "Mutual-Aid Organizations"],
  ["narcotics anonymous", "Mutual-Aid Organizations"],
  ["sober living", "Recovery Residences"], ["halfway house", "Recovery Residences"],
  ["oxford house", "Recovery Residences"],
  ["narcan", "Harm Reduction Organizations"],
  ["naloxone", "Harm Reduction Organizations"],
  ["needle exchange", "Harm Reduction Organizations"],
  ["fentanyl test strips", "Harm Reduction Organizations"],
  ["drug court", "Drug/Recovery Courts"],
  ["peer support", "Peer Recovery Services"],
];

// code, label, aliases — mirrors the TSML vocabulary in the source.
const MEETING_TYPES: [string, string, string[]][] = [
  ["O", "Open", ["open"]],
  ["C", "Closed", ["closed"]],
  ["X", "Handicap Accessible", ["handicap accessible", "handicap accesible", "wheelchair access"]],
  ["NS", "No Smoking", ["no smoking", "no tobacco"]],
  ["D", "Discussion", ["discussion"]],
  ["B", "Big Book", ["big book", "big book study"]],
  ["ST", "Step Study", ["step study", "12 steps & 12 traditions", "12 steps and 12 traditions", "steps", "12 step", "traditions study"]],
  ["SP", "Speaker", ["speaker meetings", "speaker", "lead speaker"]],
  ["LIT", "Literature", ["literature"]],
  ["BEG", "Newcomers", ["newcomers", "beginners"]],
  ["W", "Women Only", ["women only"]],
  ["M", "Men Only", ["men only"]],
  ["VAR", "Various Formats", ["various formats"]],
  ["LG", "Large Group", ["large group meeting", "large group meetings", "open share groups", "open share group"]],
  ["SM", "Small Group", ["small group meetings", "small group meeting"]],
  ["LGBTQ", "LGBTQ+", ["lgbtq", "lgbt"]],
  ["S", "Spanish Speaking", ["spanish"]],
  ["Y", "Young People", ["youth only", "students"]],
  ["A", "Adults", ["adults"]],
  ["CC", "Childcare Provided", ["childcare provided", "preschool and childcare provided"]],
  ["MED", "Meditation", ["meditation", "daily reflections"]],
  ["CAN", "Candlelight", ["candlelight"]],
  ["BT", "Basic Text", ["basic text", "literature study", "basic text, literature study"]],
  ["SPR", "Spiritual Principle", ["spiritual principle"]],
  ["TOP", "Topic", ["topic"]],
  ["MEAL", "Meal Provided", ["supper", "dinner", "cafe time", "café time"]],
  ["WOR", "Worship", ["worship", "teaching or testimony"]],
];
const ALIAS_TO_CODE = new Map<string, string>();
for (const [code, , aliases] of MEETING_TYPES) for (const a of aliases) ALIAS_TO_CODE.set(a, code);

const DAY_TOKEN = String.raw`(?:Sun|Mon|Tues|Tue|Wednes|Wednis|Thurs|Turs|Thur|Fri|Satur|Sat)day`;
const SCHED_RE = new RegExp(
  String.raw`((?:(?:1st|2nd|3rd|4th|5th)[,&\s]*(?:and\s*)?)*)` +
  String.raw`((?:` + DAY_TOKEN + String.raw`s?(?:\s*(?:,|&|and)\s*)?)+|Daily|Every\s+day)` +
  String.raw`\s*at\s*` +
  String.raw`(\d{1,2}(?::\d{2})?\s*[APap]\.?[Mm]\.?)`,
  "i",
);
const DAY_CANON: Record<string, string> = {
  sun: "sunday", mon: "monday", tues: "tuesday", tue: "tuesday",
  wednes: "wednesday", wednis: "wednesday", thurs: "thursday",
  thur: "thursday", turs: "thursday", fri: "friday",
  satur: "saturday", sat: "saturday",
};
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SERVES_RE = /Serves(?:\s+individuals\s+in)?\s+([^.]+?)\s+[Cc]ount/i;
const PHONE_RE = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

// --------------------------------------------------------------- helpers ---

const warnings: { kind: string; detail: string }[] = [];
const warn = (kind: string, detail: string) => warnings.push({ kind, detail });
const stats: Record<string, number> = {};
const bump = (k: string, n = 1) => { stats[k] = (stats[k] ?? 0) + n; };

// phone/email cells embed contacts as multi-line blocks — internal
// newlines are STRUCTURE (import_trial.py deliberately never cleaned
// these columns); only trim the ends and normalise line endings.
function keepLines(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\r\n/g, "\n").trim();
  return s || null;
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).split(/\s+/).join(" ").trim();
  return s || null;
}
function zip5(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (Number.isFinite(n)) return String(Math.trunc(n)).padStart(5, "0");
  const s = String(v).trim();
  return /^\d{5}(-\d{4})?$/.test(s) ? s : null;
}

interface Person { name: string | null; phone: string | null; email: string | null }
function parsePeople(cell: string | null): Person[] {
  if (!cell) return [];
  const out: Person[] = [];
  for (const block of cell.split(/\n\s*\n/).filter((b) => b.trim())) {
    let name: string | null = null, phone: string | null = null, email: string | null = null;
    for (const raw of block.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const em = raw.match(EMAIL_RE);
      if (em) { email = em[0]; continue; }
      const ph = raw.match(PHONE_RE);
      if (ph && !/[A-Za-z]{3}/.test(raw)) { phone = ph[0]; continue; }
      name = name ? `${name} ${raw}` : raw;
    }
    if (name || phone || email) out.push({ name, phone, email });
  }
  return out;
}

interface Sitting { day: string; time: string; weeks: number[] | null }
function parseSchedule(text: string, label: string): Sitting[] {
  const out: Sitting[] = [];
  for (const [, ordinals, days, tm] of text.matchAll(new RegExp(SCHED_RE.source, "gi"))) {
    const weeks = [...ordinals.matchAll(/([1-5])(?:st|nd|rd|th)/g)].map((m) => Number(m[1]));
    const weeksSorted = weeks.length ? [...new Set(weeks)].sort() : null;
    const m = tm.trim().match(/(\d{1,2})(?::(\d{2}))?\s*([APap])/);
    if (!m) continue;
    let h = Number(m[1]);
    const ap = m[3].toLowerCase();
    if (ap === "p" && h !== 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    const stamp = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}:00`;
    if (/^\s*(Daily|Every\s+day)\s*$/i.test(days)) {
      for (const d of WEEKDAYS) out.push({ day: d, time: stamp, weeks: weeksSorted });
      continue;
    }
    for (const d of days.match(new RegExp(DAY_TOKEN, "gi")) ?? []) {
      const stem = d.toLowerCase().slice(0, -3);
      const day = DAY_CANON[stem];
      if (!day) { warn("day_token_unrecognised", `${label}: ${d}`); continue; }
      if (["turs", "wednis", "thur", "tue", "sat"].includes(stem)) {
        warn("day_spelling_corrected", `${label}: source says ${d} -> ${day}`);
      }
      out.push({ day, time: stamp, weeks: weeksSorted });
    }
  }
  return out;
}

function parseAttributes(head: string, label: string): string[] {
  const codes: string[] = [];
  for (let tok of head.split(/[;/,]|\s+-\s+/)) {
    tok = tok.split(/\s+/).join(" ").trim().replace(/[.]+$/, "").toLowerCase();
    if (!tok || new RegExp(DAY_TOKEN, "i").test(tok) || tok.startsWith("located in")) continue;
    const code = ALIAS_TO_CODE.get(tok);
    if (code) codes.push(code);
    else warn("meeting_attr_unmapped", `${label}: ${tok}`);
  }
  return [...new Set(codes)];
}

const slugTaken = new Set<string>();
function slug(text: string): string {
  const s = text.normalize("NFKD").replace(/[^\w]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "item";
  let out = s, n = 2;
  while (slugTaken.has(out)) out = `${s}-${n++}`;
  slugTaken.add(out);
  return out;
}

// ------------------------------------------------------------ read sheet ---

interface Row {
  uid: string; name: string; categorization: string; county: string | null;
  city: string | null; address: string | null; state: string | null;
  zip: string | null; website: string | null; description: string | null;
  phone: string | null; email: string | null; additional: string | null;
}
const wb = XLSX.readFile(FILE);
const sheet = wb.Sheets[wb.SheetNames[0]];
const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
const rows: Row[] = raw.map((r) => {
  const g = (...names: string[]) => {
    for (const n of names) { const k = Object.keys(r).find((x) => x.trim().toLowerCase() === n); if (k) return r[k]; }
    return null;
  };
  return {
    uid: String(g("uid") ?? ""),
    name: clean(g("recovery asset")) ?? "",
    categorization: clean(g("recovery asset categorization")) ?? "",
    county: clean(g("county")),
    city: clean(g("city")),
    address: clean(g("address")),
    state: clean(g("state")),
    zip: zip5(g("zip")),
    website: clean(g("website")),
    description: clean(g("description")),
    phone: keepLines(g("phone")),
    email: keepLines(g("email")),
    additional: clean(g("additional information")),
  };
});
bump("source_rows", rows.length);

// -------------------------------------------------- group into organisations

interface Group {
  name: string; rows: Row[]; uids: string[]; isMeeting: boolean;
  slug: string;
}
const groups = new Map<string, Group>();
for (const r of rows) {
  let g = groups.get(r.name);
  if (!g) {
    g = { name: r.name, rows: [], uids: [], isMeeting: false, slug: slug(r.name) };
    groups.set(r.name, g);
  }
  g.rows.push(r);
  g.uids.push(r.uid);
  if (/mutual[-\s]?aid/i.test(r.categorization)) g.isMeeting = true;
}
bump("organisations", groups.size);
for (const g of groups.values()) if (g.rows.length > 1) bump("merged_groups");

// ------------------------------------------------------------- places -----

const placeKey = (r: Row) =>
  r.address ? `${r.address.toLowerCase()}|${(r.city ?? "").toLowerCase()}` : null;
interface Place { addr: string; city: string; state: string; zip: string | null; fips: string | null; key: string }
const places = new Map<string, Place>();
for (const r of rows) {
  const k = placeKey(r);
  if (!k || places.has(k)) continue;
  const st = r.state ?? "TN";
  const fips = r.county ? COUNTY_FIPS[`${r.county}|${st}`] : undefined;
  if (!fips) warn("county_unmapped", `${r.name}: ${JSON.stringify(r.county)}/${st}`);
  if (st === "VA") {
    warn("out_of_state_listing", `${r.name}: filed as Bristol city (51520), out of region`);
  }
  places.set(k, { addr: r.address!, city: r.city ?? "", state: st, zip: r.zip, fips: fips ?? null, key: k });
}
// ZIP conflicts for the same place (kept first, like the trial)
const zipByPlace = new Map<string, Set<string>>();
for (const r of rows) {
  const k = placeKey(r);
  if (k && r.zip) {
    const set = zipByPlace.get(k) ?? new Set<string>();
    set.add(r.zip);
    zipByPlace.set(k, set);
  }
}
for (const [k, zs] of zipByPlace) {
  if (zs.size > 1) {
    const p = places.get(k)!;
    warn("zip_conflict", `${p.addr}, ${p.city}: source gives ${[...zs].sort()} — kept ${p.zip}`);
  }
}
bump("locations", places.size);

// ------------------------------------------- per-org transform + meetings --

interface OrgPlan {
  group: Group;
  kind: "service" | "meeting_group";
  description: string | null; additional: string | null;
  website: string | null; publicPhone: string | null; publicEmail: string | null;
  categories: string[];
  contacts: { p: Person; needsReview: boolean; note: string | null }[];
  contactConflict: string[];
  orgPlaces: string[]; coverage: { fips: string; phone: string | null; contactName: string | null }[];
  servedFromText: string[];
  meetings: { row: Row; sittings: Sitting[]; room: string | null; fellowship: string | null; codes: string[] }[];
  needsReview: boolean;
  reviewNote: string | null;
}

const FELLOWSHIPS: [string, RegExp][] = [
  ["AA", /Alcoholics Anonymous|^AA\b/i], ["NA", /Narcotics Anonymous|^NA\b/i],
  ["Al-Anon", /Al[-\s]?Anon/i], ["Alateen", /Alateen/i],
  ["Celebrate Recovery", /Celebrate Recovery/i], ["DAA", /Drug Addicts Anonymous/i],
  ["SMART", /SMART Recovery/i],
];

const plans: OrgPlan[] = [];
for (const g of groups.values()) {
  const first = g.rows[0];
  const conflicts: Record<string, Set<string>> = {};
  for (const col of ["website", "description"] as const) {
    const vals = new Set(g.rows.map((r) => r[col]).filter(Boolean) as string[]);
    if (vals.size > 1) {
      conflicts[col] = vals;
      warn("field_conflict_on_merge", `${g.name}: ${col} has ${vals.size} values across ${g.uids.join(",")}`);
    }
  }
  const people = g.rows.flatMap((r) => parsePeople(r.phone).concat(parsePeople(r.email)));
  const bare = people.filter((p) => !p.name);
  const named = people.filter((p) => p.name);
  const byName = new Map<string, { p: Person; variants: Set<string> }>();
  for (const p of named) {
    const e = byName.get(p.name!) ?? { p, variants: new Set<string>() };
    if (e.p.phone && p.phone && e.p.phone !== p.phone) e.variants.add(p.phone);
    e.p.phone ??= p.phone;
    e.p.email ??= p.email;
    byName.set(p.name!, e);
  }
  const contactConflict: string[] = [];
  for (const [, e] of byName) {
    if (e.variants.size) {
      contactConflict.push(`${e.p.name}: also ${[...e.variants].sort().join(", ")}`);
      warn("contact_phone_conflict", `${g.name} / ${e.p.name}: source disagrees`);
    }
  }
  const plan: OrgPlan = {
    group: g,
    kind: g.isMeeting ? "meeting_group" : "service",
    description: first.description,
    additional: g.isMeeting || (first.additional && SERVES_RE.test(first.additional)) ? null : first.additional,
    website: first.website,
    publicPhone: bare.length === 1 ? bare[0].phone : null,
    publicEmail: (() => {
      const emails = people.filter((p) => p.email && !p.name);
      return emails.length === 1 ? emails[0].email : null;
    })(),
    categories: [...new Set(g.rows.flatMap((r) => r.categorization.split(";").map((c) => c.trim()).filter(Boolean)))]
      .map((c) => resolveCategory(c) ?? c),
    contacts: [...byName.values()].map((e) => ({
      p: e.p,
      needsReview: e.variants.size > 0,
      note: e.variants.size > 0
        ? `source disagrees: also ${[...e.variants].sort().join(", ")}`
        : null,
    })),
    contactConflict,
    orgPlaces: [],
    coverage: [],
    servedFromText: [],
    meetings: [],
    needsReview: false,
    reviewNote: null,
  };
  for (const c of plan.categories) {
    if (!resolveCategory(c)) warn("category_unmapped", `${g.name}: ${c}`);
  }
  for (const r of g.rows) {
    const k = placeKey(r);
    if (k && !plan.orgPlaces.includes(k)) plan.orgPlaces.push(k);
  }
  if (plan.orgPlaces.length > 1) bump("orgs_with_multiple_locations");
  if (plan.orgPlaces.length === 0) bump("orgs_without_location");
  for (const r of g.rows) {
    if (placeKey(r)) continue;
    const st = r.state ?? "TN";
    const fips = r.county ? COUNTY_FIPS[`${r.county}|${st}`] : undefined;
    if (!fips) { warn("county_unmapped", `${g.name}: coverage row ${JSON.stringify(r.county)}`); continue; }
    const ppl = parsePeople(r.phone).filter((p) => p.name);
    const bareP = parsePeople(r.phone).find((p) => !p.name);
    plan.coverage.push({ fips, phone: bareP?.phone ?? ppl[0]?.phone ?? null, contactName: ppl.length === 1 ? ppl[0].name : null });
  }
  for (const r of g.rows) {
    const ai = r.additional ?? "";
    const m = ai.match(SERVES_RE);
    if (!m) continue;
    for (const cnRaw of m[1].split(/,|&|\band\b/)) {
      const cn = cnRaw.trim().replace(/\.+$/, "");
      if (!cn) continue;
      const fips = COUNTY_FIPS[`${cn}|TN`];
      if (!fips) { warn("served_county_unmapped", `${g.name}: ${cn}`); continue; }
      if (!plan.servedFromText.includes(fips)) plan.servedFromText.push(fips);
    }
  }
  if (g.isMeeting) {
    const fellowship = FELLOWSHIPS.find(([, re]) => re.test(g.name))?.[0] ?? null;
    for (const r of g.rows) {
      const ai = r.additional ?? "";
      const sittings = parseSchedule(ai, g.name);
      const room = ai.match(/Located in ([^.]+)/i)?.[1]?.trim() ?? null;
      const head = ai.split(".")[0] ?? "";
      const codes = head && !SCHED_RE.test(head) ? parseAttributes(head, g.name) : [];
      if (!placeKey(r)) {
        warn("meeting_without_location", `${g.name}: no address; needs venue or online link`);
        continue;
      }
      if (!sittings.length) warn("meeting_no_schedule", `${g.name}: no parseable day/time`);
      plan.meetings.push({ row: r, sittings, room, fellowship, codes });
      bump("meeting_series");
      bump("meeting_schedules", sittings.length);
    }
  }
  // human-review flags: the doc promises "flags the row" — merge conflicts
  // and schedule-less meetings surface on the org in Directus, not just
  // in the import report. Insert-only: monthly re-runs never overwrite or
  // clear them (humans clear them through review).
  const conflictBits: string[] = [];
  for (const col of ["website", "description"] as const) {
    if (conflicts[col]) conflictBits.push(`${col} has ${conflicts[col].size} values — first kept`);
  }
  const noSchedule = plan.meetings.filter((m) => m.sittings.length === 0).length;
  const reviewBits: string[] = [];
  if (conflictBits.length) {
    reviewBits.push(`source disagrees across ${g.uids.join(",")}: ${conflictBits.join("; ")}`);
  }
  if (noSchedule) {
    reviewBits.push(`${noSchedule} meeting${noSchedule === 1 ? "" : "s"} named without day/time — supply schedules`);
  }
  plan.needsReview = reviewBits.length > 0;
  plan.reviewNote = reviewBits.join(" | ") || null;

  plans.push(plan);
}

// ------------------------------------------------------------- dry report --

function report() {
  console.log("=== IMPORT PLAN ===");
  for (const k of [
    "source_rows", "organisations", "merged_groups", "orgs_with_multiple_locations",
    "orgs_without_location", "locations", "meeting_series", "meeting_schedules",
  ]) console.log(`  ${k.padEnd(30)} ${stats[k] ?? 0}`);
  const counts = new Map<string, number>();
  for (const w of warnings) counts.set(w.kind, (counts.get(w.kind) ?? 0) + 1);
  console.log(`\n=== ${warnings.length} rows flagged for human review ===`);
  for (const [k, c] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(28)} ${c}`);
  }
  console.log();
  for (const w of warnings) console.log(`  [${w.kind}] ${w.detail}`);
}

if (DRY) {
  report();
  process.exit(0);
}

// ------------------------------------------------------------ db writing ---

function sha256(s: string): string { return createHash("sha256").update(s).digest("hex"); }

async function connect(): Promise<Client> {
  // SSL by hostname, not substring: the local container's superuser is
  // literally named supabase_admin, so a naive TARGET.includes("supabase")
  // would try SSL against a non-SSL server.
  const host = new URL(TARGET).hostname;
  const needsSsl = host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
  let lastError: unknown;
  for (let a = 1; ; a++) {
    // a fresh Client per attempt — node-pg forbids reusing a used client,
    // so retrying with the same instance just throws "already connected"
    const c = new Client({
      connectionString: TARGET,
      ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 20000,
      statement_timeout: 300000,
    });
    try {
      await c.connect();
      return c;
    } catch (e) {
      lastError = e;
      console.warn(`connect attempt ${a} failed: ${e instanceof Error ? e.message : e}`);
      try { await c.end(); } catch { /* never connected */ }
      if (a >= 6) throw lastError;
      await new Promise((r) => setTimeout(r, 2000 * a));
    }
  }
}



async function main() {
  console.log("target set — starting real import");
  const client = await connect();
  const fileHash = sha256(readFileSync(FILE, "base64"));
  await client.query("BEGIN");

  // lookups ---------------------------------------------------------
  const region = await client.query("INSERT INTO regions (slug,name,settings) VALUES ('netn-reach','Northeast Tennessee Reach','{}'::jsonb) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id");
  const regionId = region.rows[0].id as number;

  const catIds = new Map<string, number>();
  const catRows = [...new Set(Object.values(SINGULAR_TO_CATEGORY))].sort();
  for (let i = 0; i < catRows.length; i++) {
    const c = catRows[i];
    const r = await client.query(
      `INSERT INTO categories (region_id,slug,name,sort_order) VALUES ($1,$2,$3,$4)
       ON CONFLICT (region_id,slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [regionId, c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), c, (i + 1) * 10],
    );
    catIds.set(c, r.rows[0].id as number);
  }
  const countyIds = new Map<string, string>();
  for (const [key, fips] of Object.entries(COUNTY_FIPS)) {
    const [name, st] = key.split("|");
    const disp = fips === "51520" ? "Bristol city" : name;
    await client.query(
      `INSERT INTO counties (fips,name,state_code,in_region,region_id) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (fips) DO UPDATE SET in_region = EXCLUDED.in_region`,
      [fips, disp, st, st === "TN" && name in NETN, regionId],
    );
    countyIds.set(key, fips);
  }
  const topicIds = new Map<string, number>();
  for (let i = 0; i < TOPICS.length; i++) {
    const t = TOPICS[i];
    const r = await client.query(
      `INSERT INTO plain_language_topics (region_id,slug,label,sort_order) VALUES ($1,$2,$3,$4)
       ON CONFLICT (region_id,slug) DO UPDATE SET label = EXCLUDED.label RETURNING id`,
      [regionId, t.slug, t.label, (i + 1) * 10],
    );
    topicIds.set(t.slug, r.rows[0].id as number);
    for (const c of t.cats) {
      await client.query(
        `INSERT INTO topic_categories (topic_id,category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [r.rows[0].id, catIds.get(c)],
      );
    }
  }
  for (const [term, cat] of SYNONYMS) {
    const e = await client.query(`SELECT 1 FROM search_synonyms WHERE region_id=$1 AND lower(term)=lower($2) AND category_id=$3`, [regionId, term, catIds.get(cat)]);
    if (e.rowCount === 0) {
      await client.query(`INSERT INTO search_synonyms (region_id,term,category_id) VALUES ($1,$2,$3)`, [regionId, term, catIds.get(cat)]);
    }
  }
  for (const [code, label, aliases] of MEETING_TYPES) {
    await client.query(
      `INSERT INTO meeting_types (region_id,code,label,aliases) VALUES ($1,$2,$3,$4)
       ON CONFLICT (region_id,code) DO UPDATE SET label = EXCLUDED.label, aliases = EXCLUDED.aliases`,
      [regionId, code, label, aliases],
    );
  }
  const typeIds = new Map<string, number>();
  for (const r of (await client.query("SELECT id, code FROM meeting_types WHERE region_id=$1", [regionId])).rows) typeIds.set(r.code, r.id);
  console.log("lookups ensured (region, 14 categories, counties, topics, synonyms, meeting types)");

  // seed removal ------------------------------------------------------
  const seed = await client.query(`DELETE FROM organisations WHERE legacy_uids::text LIKE '["SEED:%' OR legacy_uids::text LIKE '%SEED:%' RETURNING id`);
  if (seed.rowCount) console.log(`removed ${seed.rowCount} demo seed organisations`);

  // import run ---------------------------------------------------------
  const run = await client.query(
    `INSERT INTO import_runs (region_id,source_system,source_file,file_hash)
     VALUES ($1,'uidmaster',$2,$3) RETURNING id`,
    [regionId, FILE.split("/").pop(), fileHash],
  );
  const runId = run.rows[0].id as number;

  // places -------------------------------------------------------------
  const placeIds = new Map<string, number>();
  for (const p of places.values()) {
    const ex = await client.query(
      `SELECT id FROM locations WHERE region_id=$1 AND lower(coalesce(address_line1,''))=lower($2) AND lower(coalesce(city,''))=lower($3)`,
      [regionId, p.addr, p.city],
    );
    if (ex.rowCount) { placeIds.set(p.key, ex.rows[0].id as number); continue; }
    const r = await client.query(
      `INSERT INTO locations (region_id,address_line1,city,state_code,postal_code,county_fips)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [regionId, p.addr, p.city, p.state, p.zip, p.fips],
    );
    placeIds.set(p.key, r.rows[0].id as number);
  }

  // source_records index (for monthly upserts / vanished detection) ----
  const priorRecords = new Map<string, { id: number; entity_table: string; entity_id: number; content_hash: string | null }>();
  for (const r of (await client.query("SELECT id, source_uid, entity_table, entity_id, content_hash FROM source_records WHERE source_system='uidmaster'")).rows) {
    priorRecords.set(r.source_uid, r);
  }

  const contentHash = (r: Row) =>
    sha256([r.name, r.categorization, r.county, r.city, r.address, r.state, r.zip, r.website, r.description, r.phone, r.email, r.additional].join("\u0001"));

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const plan of plans) {
    const g = plan.group;
    const known = g.uids
      .map((u) => priorRecords.get(u))
      .filter((r): r is NonNullable<typeof r> => r !== undefined);
    const firstSeen = known.length === 0;
    const allSameHash =
      known.length === g.uids.length &&
      g.rows.every((r) => priorRecords.get(r.uid)?.content_hash === contentHash(r));
    const orgRow = await client.query(
      `INSERT INTO organisations
         (region_id,slug,name,kind,description,additional_info,website,public_phone,public_email,
          status,last_verified_on,legacy_uids,needs_review,review_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'published','2026-07-30',$10,$11,$12)
       ON CONFLICT (region_id,slug) DO UPDATE SET
         description = EXCLUDED.description, website = EXCLUDED.website,
         public_phone = EXCLUDED.public_phone, public_email = EXCLUDED.public_email,
         additional_info = EXCLUDED.additional_info
       RETURNING id`,
      [regionId, g.slug, g.name, plan.kind, plan.description, plan.additional,
       plan.website, plan.publicPhone, plan.publicEmail, g.uids,
       plan.needsReview, plan.reviewNote],
    );
    const orgId = orgRow.rows[0].id as number;
    if (firstSeen) added++;
    else if (allSameHash) unchanged++;
    else updated++;

    for (let i = 0; i < plan.categories.length; i++) {
      await client.query(
        `INSERT INTO organisation_categories (organisation_id,category_id,is_primary)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [orgId, catIds.get(plan.categories[i]), i === 0],
      );
    }
    // idempotent per org: clear this org's contacts (service_areas links
    // cascade to NULL and are re-linked below), then insert fresh with
    // conflict flags visible to reviewers in Directus
    await client.query(`DELETE FROM contacts WHERE organisation_id = $1`, [orgId]);
    const contactIdByName = new Map<string, number>();
    for (let i = 0; i < plan.contacts.length; i++) {
      const { p: c, needsReview, note } = plan.contacts[i];
      const cr = await client.query(
        `INSERT INTO contacts (organisation_id,name,phone,email,needs_review,review_note,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [orgId, c.name, c.phone, c.email, needsReview, note, (i + 1) * 10],
      );
      if (c.name) contactIdByName.set(c.name, cr.rows[0].id as number);
    }
    for (let i = 0; i < plan.orgPlaces.length; i++) {
      const k = plan.orgPlaces[i];
      const locId = placeIds.get(k)!;
      await client.query(
        `INSERT INTO organisation_locations (organisation_id,location_id,is_primary)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [orgId, locId, i === 0],
      );
      const p = places.get(k)!;
      if (p.fips) {
        await client.query(
          `INSERT INTO service_areas (organisation_id,county_fips) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [orgId, p.fips],
        );
      }
    }
    for (const cov of plan.coverage) {
      // the specialist is already an org-level contact (byName covers all
      // rows) — link, never re-insert, or multi-county people duplicate
      const contactId = cov.contactName ? contactIdByName.get(cov.contactName) ?? null : null;
      await client.query(
        `INSERT INTO service_areas (organisation_id,county_fips,contact_id,public_phone)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (organisation_id,county_fips) DO UPDATE
           SET contact_id = COALESCE(service_areas.contact_id, EXCLUDED.contact_id),
               public_phone = COALESCE(EXCLUDED.public_phone, service_areas.public_phone)`,
        [orgId, cov.fips, contactId, cov.phone],
      );
      bump("service_areas_with_named_contact", cov.contactName ? 1 : 0);
    }
    for (const fips of plan.servedFromText) {
      await client.query(
        `INSERT INTO service_areas (organisation_id,county_fips) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [orgId, fips],
      );
      bump("service_areas_from_text");
    }
    for (const mtg of plan.meetings) {
      const mslug = slug(`${g.name}-${mtg.row.uid}-meeting`);
      const locId = placeIds.get(placeKey(mtg.row)!)!;
      const ms = await client.query(
        `INSERT INTO meeting_series (region_id,organisation_id,location_id,name,slug,fellowship,room,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'published')
         ON CONFLICT (region_id,slug) DO UPDATE SET
           organisation_id = EXCLUDED.organisation_id,
           location_id = EXCLUDED.location_id,
           name = EXCLUDED.name,
           fellowship = EXCLUDED.fellowship,
           room = EXCLUDED.room,
           status = 'published'
         RETURNING id`,
        [regionId, orgId, locId, g.name, mslug, mtg.fellowship, mtg.room],
      );
      const seriesId = ms.rows[0].id as number;
      for (const code of mtg.codes) {
        await client.query(
          `INSERT INTO meeting_series_types (series_id,meeting_type_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [seriesId, typeIds.get(code)],
        );
      }
      for (const s of mtg.sittings) {
        await client.query(
          `INSERT INTO meeting_schedules (series_id,day_of_week,start_time,weeks_of_month)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT DO NOTHING`,
          [seriesId, s.day, s.time, s.weeks],
        );
      }
    }
    for (const uid of g.uids) {
      const r = g.rows.find((x) => x.uid === uid)!;
      const hash = contentHash(r);
      await client.query(
        `INSERT INTO source_records (source_system,source_uid,entity_table,entity_id,content_hash,last_seen_run_id)
         VALUES ('uidmaster',$1,'organisations',$2,$3,$4)
         ON CONFLICT (source_system,source_uid) DO UPDATE
           SET content_hash = EXCLUDED.content_hash,
               last_seen_at = now(),
               last_seen_run_id = EXCLUDED.last_seen_run_id`,
        [uid, orgId, hash, runId],
      );
    }
    bump("contacts", plan.contacts.length);
    bump("service_areas", plan.orgPlaces.filter((k) => places.get(k)!.fips).length + plan.coverage.length + plan.servedFromText.length);
  }

  // vanished handling (future monthly runs; empty on first run) --------
  const seen = new Set(rows.map((r) => r.uid));
  const vanished: number[] = [];
  for (const [uid, rec] of priorRecords) {
    if (!seen.has(uid) && rec.entity_table === "organisations") vanished.push(rec.entity_id);
  }
  const priorTotal = priorRecords.size;
  if (priorTotal > 0 && vanished.length / priorTotal > 0.1) {
    await client.query("ROLLBACK");
    console.error(`BLAST-RADIUS GUARD: ${vanished.length}/${priorTotal} would vanish — halting, nothing committed`);
    process.exit(2);
  }
  for (const orgId of vanished) {
    await client.query(`UPDATE organisations SET status='draft', needs_review=true, review_note='UID vanished from monthly file' WHERE id=$1`, [orgId]);
  }
  // reappearing UIDs: org currently draft+needs_review whose UID is back → stay draft for a human
  for (const uid of seen) {
    const rec = priorRecords.get(uid);
    if (!rec) continue;
    const cur = await client.query(`SELECT status, needs_review FROM organisations WHERE id=$1`, [rec.entity_id]);
    if (cur.rows[0]?.needs_review && cur.rows[0]?.status === "draft") {
      await client.query(`UPDATE organisations SET review_note='UID reappeared in monthly file — awaiting human review' WHERE id=$1`, [rec.entity_id]);
    }
  }

  await client.query(
    `UPDATE import_runs SET finished_at=now(), added_count=$1, updated_count=$2,
       unchanged_count=$3, vanished_count=$4, notes=$5 WHERE id=$6`,
    [added, updated, unchanged, vanished.length, `${warnings.length} flagged rows`, runId],
  );
  await client.query("COMMIT");
  await client.end();

  report();
  console.log(`\nCOMMITTED: added ${added}, updated ${updated}, unchanged ${unchanged}, vanished ${vanished.length}, run id ${runId}`);
}

main().catch(async (e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
