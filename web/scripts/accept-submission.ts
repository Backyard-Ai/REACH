/**
 * Accepts a pending submission: creates the organisation (draft),
 * resolves and links categories, counties, and attributes from the
 * payload's human-readable names. Marks the submission approved.
 *
 * Usage:
 *   npx tsx scripts/accept-submission.ts <submission-id>
 *
 * The organisation is created as status='draft' — publishing is a
 * separate, deliberate human action.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

function loadEnv(): string {
  const raw = readFileSync(join(REPO_ROOT, "web", ".env.local"), "utf8");
  const m = raw.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not found in web/.env.local");
  return m[1].trim();
}

interface Payload {
  name: string;
  description?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: { street: string; city: string; state: string; zip?: string; county?: string } | null;
  counties_served?: string[];
  categories?: string[];
  populations?: string[];
  payment?: string[];
  accessibility?: string[];
  languages?: string[];
}

async function main() {
  const subId = Number(process.argv[2]);
  if (!Number.isInteger(subId)) {
    console.error("Usage: npx tsx scripts/accept-submission.ts <submission-id>");
    process.exit(1);
  }

  const c = new Client({
    connectionString: loadEnv(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  for (let a = 1; ; a++) {
    try { await c.connect(); break; }
    catch (e) { if (a >= 5) throw e; await new Promise(r => setTimeout(r, 2000 * a)); }
  }

  // fetch the submission
  const { rows: [sub] } = await c.query(
    "SELECT id, kind, status, payload, submitter_name FROM submissions WHERE id = $1", [subId]
  );
  if (!sub) { console.error(`submission #${subId} not found`); process.exit(1); }
  if (sub.status !== "pending") { console.error(`submission #${subId} is ${sub.status}, not pending`); process.exit(1); }
  if (sub.kind !== "new_listing") { console.error(`kind is ${sub.kind}, not new_listing (this script handles new listings only)`); process.exit(1); }

  const p: Payload = sub.payload;
  console.log(`\nAccepting submission #${subId}: "${p.name}"`);
  console.log(`  categories: ${p.categories?.join(", ") || "none"}`);
  console.log(`  counties served: ${p.counties_served?.join(", ") || "none"}`);
  console.log(`  address: ${p.address ? `${p.address.street}, ${p.address.city}` : "none"}`);
  console.log("");

  await c.query("BEGIN");

  try {
    // resolve region
    const { rows: regionRows } = await c.query("SELECT id FROM regions WHERE slug = 'netn-reach'");
    const region = regionRows[0];
    if (!region) throw new Error("Region not found");
    const regionId: number = region?.id ?? 0;

    // slugify
    const baseSlug = p.name.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "listing";
    let slug = baseSlug, n = 2;
    const slugTaken = async (s: string) => (await c!.query("SELECT 1 FROM organisations WHERE slug = $1 AND region_id = $2", [s, regionId])).rowCount ?? 0 > 0;
    while (await slugTaken(slug)) {
      slug = `${baseSlug}-${n++}`;
    }

    // create the organisation (draft)
    const website = p.website && !p.website.startsWith("http") ? `https://${p.website}` : p.website;
    const { rows: [org] } = await c.query(
      `INSERT INTO organisations (region_id, slug, name, kind, description, website,
         public_phone, public_email, status, last_verified_on)
       VALUES ($1, $2, $3, 'service', $4, $5, $6, $7, 'draft', NULL)
       RETURNING id, slug`,
      [regionId, slug, p.name, p.description || null, website || null, p.phone || null, p.email || null]
    );
    console.log(`✓ organisation created: ${org.slug} (id ${org.id}, status: draft)`);

    // link categories
    if (p.categories?.length) {
      for (const catName of p.categories) {
        const { rows: [cat] } = await c.query(
          "SELECT id FROM categories WHERE name = $1 AND region_id = $2", [catName, region.id]
        );
        if (cat) {
          await c.query(
            "INSERT INTO organisation_categories (organisation_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [org.id, cat.id]
          );
          console.log(`  ✓ category: ${catName}`);
        } else {
          console.warn(`  ⚠ category not found: "${catName}" — link manually`);
        }
      }
    }

    // create location + service areas
    if (p.address?.street) {
      const { rows: [county] } = await c.query(
        "SELECT fips FROM counties WHERE name = $1", [p.address.county || p.address.city]
      );
      const { rows: [loc] } = await c.query(
        `INSERT INTO locations (region_id, address_line1, city, state_code, postal_code, county_fips)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [region.id, p.address.street, p.address.city, p.address.state || "TN", p.address.zip || null, county?.fips || null]
      );
      await c.query(
        "INSERT INTO organisation_locations (organisation_id, location_id, is_primary) VALUES ($1, $2, true)",
        [org.id, loc.id]
      );
      if (county?.fips) {
        await c.query(
          "INSERT INTO service_areas (organisation_id, county_fips) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [org.id, county.fips]
        );
      }
      console.log(`  ✓ location: ${p.address.street}, ${p.address.city}${county ? ` (${p.address.county} County)` : ""}`);
    }

    // counties served (coverage)
    if (p.counties_served?.length) {
      for (const countyName of p.counties_served) {
        const { rows: [county] } = await c.query(
          "SELECT fips FROM counties WHERE name = $1", [countyName]
        );
        if (county) {
          await c.query(
            "INSERT INTO service_areas (organisation_id, county_fips) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [org.id, county.fips]
          );
          console.log(`  ✓ service area: ${countyName} County`);
        } else {
          console.warn(`  ⚠ county not found: "${countyName}"`);
        }
      }
    }

    // link attributes (populations, payment, accessibility, languages)
    const attrMap: Record<string, string[]> = {
      population: p.populations || [],
      payment: p.payment || [],
      access: p.accessibility || [],
      language: p.languages || [],
    };
    for (const [kind, labels] of Object.entries(attrMap)) {
      for (const label of labels) {
        const { rows: [attr] } = await c.query(
          "SELECT id FROM attributes WHERE label = $1 AND kind = $2 AND region_id = $3",
          [label, kind, region.id]
        );
        if (attr) {
          await c.query(
            "INSERT INTO organisation_attributes (organisation_id, attribute_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [org.id, attr.id]
          );
          console.log(`  ✓ ${kind}: ${label}`);
        } else {
          console.warn(`  ⚠ ${kind} not found: "${label}" — may need to be created`);
        }
      }
    }

    // mark the submission approved
    await c.query(
      "UPDATE submissions SET status = 'approved', reviewed_by = $2, reviewed_at = now() WHERE id = $1",
      [subId, `script:accept (submitted by ${sub.submitter_name || "anonymous"})`]
    );
    console.log(`✓ submission #${subId} marked approved`);

    await c.query("COMMIT");
    console.log(`\nDone. Organisation "${p.name}" created as draft (slug: ${org.slug}).`);
    console.log(`Publish it in Directus when ready, or:`);
    console.log(`  UPDATE organisations SET status = 'published' WHERE id = ${org.id};`);
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("ROLLED BACK:", e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    await c.end();
  }
}

main();
