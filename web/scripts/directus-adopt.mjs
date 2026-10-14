/**
 * Adopts the existing REACH tables as configured Directus collections.
 * Meta-only — no `schema` payload, so zero DDL: the frozen schema is
 * never touched, we only create directus_collections rows (the same
 * thing the Data Model "configure existing table" button does).
 *
 * Run: node scripts/directus-adopt.mjs   (reads .env.directus)
 */
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.directus", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split("=")),
);

const BASE = "http://localhost:8055";

async function main() {
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.DIRECTUS_ADMIN_EMAIL,
      password: env.DIRECTUS_ADMIN_PASSWORD,
    }),
  });
  const { data } = await login.json();
  const token = data.access_token;
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // name, icon, note, hidden (link tables hidden from sidebar)
  const tables = [
    ["organisations", "apartment", "The listings — status controls draft/published", false],
    ["submissions", "inbox", "Public review queue (corrections / new listings)", false],
    ["crisis_lines", "support_agent", "Crisis numbers with verified dates", false],
    ["categories", "category", "Professional taxonomy (14)", false],
    ["plain_language_topics", "record_voice_over", "Plain-language browse layer", false],
    ["counties", "map", "FIPS-keyed counties", false],
    ["locations", "place", "Physical places (shared venues)", false],
    ["service_areas", "share", "Coverage: org x county", true],
    ["organisation_hours", "schedule", "One row per open span", true],
    ["meeting_series", "groups", "Mutual-aid series (phase: meetings path)", false],
    ["meeting_schedules", "event", "Sittings per series", true],
    ["meeting_types", "label", "TSML codes and aliases", true],
    ["attributes", "tune", "Vocabulary for filters", true],
    ["search_synonyms", "manage_search", "Synonym table for search", true],
    ["stories", "auto_stories", "Consent-gated stories (phase 2)", false],
    ["regions", "public", "Tenancy — one row today", true],
    ["topic_categories", "link", "topic <-> category mapping", true],
    ["organisation_categories", "link", "org <-> category mapping", true],
    ["organisation_locations", "link", "org <-> place mapping", true],
    ["organisation_attributes", "link", "org <-> attribute mapping", true],
    ["meeting_series_types", "link", "series <-> type mapping", true],
    ["contacts", "badge", "PRIVATE — staff contacts, no public read", true],
    ["practitioner_notes", "lock", "PRIVATE — professional-facing notes", true],
    ["source_records", "history", "PRIVATE — import bookkeeping", true],
    ["import_runs", "history", "PRIVATE — one row per refresh", true],
  ];

  const existing = new Set(
    (await (await fetch(`${BASE}/collections?limit=-1`, { headers: H })).json())
      .data.map((c) => c.collection),
  );

  let created = 0;
  for (const [name, icon, note, hidden] of tables) {
    if (existing.has(name)) {
      console.log(`skip ${name} (already configured)`);
      continue;
    }
    const res = await fetch(`${BASE}/collections`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        collection: name,
        meta: { collection: name, icon, note, hidden, sort: null },
      }),
    });
    if (!res.ok) {
      console.log(`FAIL ${name}: ${res.status} ${(await res.text()).slice(0, 120)}`);
      continue;
    }
    created++;
    console.log(`adopted ${name}`);
  }
  console.log(`\n${created} collections adopted, ${tables.length - created} skipped`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
