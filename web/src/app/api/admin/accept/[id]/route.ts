import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * One-click submission acceptance.
 *
 * GET /api/admin/accept/[id]?token=ADMIN_ACTION_TOKEN
 *
 * Creates a draft organisation from the submission payload with all
 * categories, counties, attributes, and location linked — the same
 * logic as scripts/accept-submission.ts, but callable via URL so
 * a Directus reviewer can just click a link.
 *
 * Protect with ADMIN_ACTION_TOKEN in env (shared secret between
 * Directus and the app — not the service-role key).
 */

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const subId = Number(idStr);
  const token = request.nextUrl.searchParams.get("token");
  const expected = process.env.ADMIN_ACTION_TOKEN;

  if (!expected || token !== expected) {
    return htmlResponse("Unauthorized", "Invalid or missing token. Set ADMIN_ACTION_TOKEN in the environment.", 401);
  }
  if (!Number.isInteger(subId)) {
    return htmlResponse("Invalid ID", "The submission ID must be a number.", 400);
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return htmlResponse("Configuration Error", "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.", 500);
  }

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  // fetch the submission
  const { data: sub, error: subErr } = await db
    .from("submissions")
    .select("id, kind, status, payload, submitter_name")
    .eq("id", subId)
    .maybeSingle();
  if (subErr || !sub) {
    return htmlResponse("Not Found", `Submission #${subId} not found.`, 404);
  }
  if (sub.status !== "pending") {
    return htmlResponse("Already Processed", `Submission #${subId} is already <strong>${sub.status}</strong>. Only pending submissions can be accepted.`, 409);
  }
  if (sub.kind !== "new_listing") {
    return htmlResponse("Wrong Type", `This is a <strong>${sub.kind}</strong> submission. The accept button only handles new listings.`, 422);
  }

  const p: Payload = sub.payload;
  if (!p?.name) {
    return htmlResponse("Invalid Payload", "The submission payload has no name.", 422);
  }

  // resolve region
  const { data: region } = await db.from("regions").select("id").eq("slug", "netn-reach").single();
  if (!region) {
    return htmlResponse("Configuration Error", "Region 'netn-reach' not found.", 500);
  }
  const regionId = region.id;

  // slugify with uniqueness check
  const baseSlug = p.name.toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "listing";
  let slug = baseSlug;
  let n = 2;
  for (;;) {
    const { data: existing } = await db.from("organisations").select("id").eq("slug", slug).eq("region_id", regionId).maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${n++}`;
  }

  const website = p.website && !p.website.startsWith("http") ? `https://${p.website}` : p.website;

  // create the organisation (draft)
  const { data: org, error: orgErr } = await db.from("organisations").insert({
    region_id: regionId,
    slug,
    name: p.name,
    kind: "service",
    description: p.description || null,
    website: website || null,
    public_phone: p.phone || null,
    public_email: p.email || null,
    status: "draft",
  }).select("id, slug").single();
  if (orgErr) {
    return htmlResponse("Creation Failed", `Could not create the organisation: ${orgErr.message}`, 500);
  }

  const orgId = org.id;
  const results: string[] = [`✓ Organisation created: <strong>${p.name}</strong> (slug: ${org.slug}, status: draft)`];

  // link categories
  for (const catName of p.categories ?? []) {
    const { data: cat } = await db.from("categories").select("id").eq("name", catName).eq("region_id", regionId).maybeSingle();
    if (cat) {
      await db.from("organisation_categories").insert({ organisation_id: orgId, category_id: cat.id });
      results.push(`✓ Category: ${catName}`);
    } else {
      results.push(`⚠ Category not found: ${catName}`);
    }
  }

  // location + home county
  if (p.address?.street) {
    let countyFips: string | null = null;
    if (p.address.county) {
      const { data: county } = await db.from("counties").select("fips").eq("name", p.address.county).maybeSingle();
      countyFips = county?.fips ?? null;
    }
    const { data: loc } = await db.from("locations").insert({
      region_id: regionId,
      address_line1: p.address.street,
      city: p.address.city,
      state_code: p.address.state || "TN",
      postal_code: p.address.zip || null,
      county_fips: countyFips,
    }).select("id").single();
    if (loc) {
      await db.from("organisation_locations").insert({ organisation_id: orgId, location_id: loc.id, is_primary: true });
      if (countyFips) {
        await db.from("service_areas").insert({ organisation_id: orgId, county_fips: countyFips });
      }
      results.push(`✓ Location: ${p.address.street}, ${p.address.city}`);
    }
  }

  // counties served
  for (const countyName of p.counties_served ?? []) {
    const { data: county } = await db.from("counties").select("fips").eq("name", countyName).maybeSingle();
    if (county) {
      await db.from("service_areas").upsert({ organisation_id: orgId, county_fips: county.fips }, { onConflict: "organisation_id,county_fips" });
      results.push(`✓ Service area: ${countyName} County`);
    }
  }

  // attributes
  const attrMap: Record<string, string[]> = {
    population: p.populations ?? [],
    payment: p.payment ?? [],
    access: p.accessibility ?? [],
    language: p.languages ?? [],
  };
  for (const [kind, labels] of Object.entries(attrMap)) {
    for (const label of labels) {
      const { data: attr } = await db.from("attributes").select("id").eq("label", label).eq("kind", kind).eq("region_id", regionId).maybeSingle();
      if (attr) {
        await db.from("organisation_attributes").insert({ organisation_id: orgId, attribute_id: attr.id });
        results.push(`✓ ${kind}: ${label}`);
      } else {
        results.push(`⚠ ${kind} not found: ${label}`);
      }
    }
  }

  // mark the submission approved
  await db.from("submissions").update({
    status: "approved",
    reviewed_by: `api:accept (submitted by ${sub.submitter_name ?? "anonymous"})`,
    reviewed_at: new Date().toISOString(),
  }).eq("id", subId);
  results.push(`✓ Submission #${subId} marked approved`);

  results.push(`<br><strong>Next step:</strong> open <code>organisations</code> in Directus, find <strong>${p.name}</strong>, review it, and change status to <strong>published</strong> when ready.`);

  return htmlResponse("Submission Accepted", results.join("<br>"), 200);
}

function htmlResponse(title: string, body: string, status: number): Response {
  const html =
    "<!doctype html><html><head><title>" + title + "</title><style>" +
    "body{font-family:system-ui,sans-serif;max-width:600px;margin:3rem auto;padding:0 1rem;line-height:1.6}" +
    "h1{color:#24114D}code{background:#f2f2f2;padding:2px 6px;border-radius:4px}" +
    "a{color:#177A8C}" +
    "</style></head><body><h1>" + title + "</h1><p>" + body + "</p>" +
    '<p><a href="javascript:history.back()">\u2190 Back to Directus</a></p></body></html>';
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
