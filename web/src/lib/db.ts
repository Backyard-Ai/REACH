import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * The single data-access boundary for the public site.
 *
 * - Reads ONLY from the published_resources view and the RLS-exposed
 *   lookup tables (crisis_lines, plain_language_topics, topic_categories,
 *   categories, counties). Nothing else.
 * - Search runs inside Postgres via the search_resources RPC
 *   (sql/001_search_resources.sql) using the schema's trigram and
 *   full-text indexes.
 * - Everything here is server-only: no keys or queries reach the client.
 */

// ---------------------------------------------------------------------------
// JSON fields from the views — zod-validated at this boundary.
// ---------------------------------------------------------------------------

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export const locationSchema = z.object({
  location_id: z.number().int(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postal_code: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

export const hoursEntrySchema = z.object({
  day: z.enum(WEEKDAYS),
  opens: z.string(),
  closes: z.string(),
  note: z.string().nullable(),
  verified_on: z.string().nullable(),
  location_id: z.number().int().nullable(),
});

export const countyCoverageSchema = z.object({
  county: z.string(),
  fips: z.string(),
  phone: z.string().nullable(),
});

export const attributesSchema = z.record(
  z.string(),
  z.array(z.string()),
);

export const resourceSchema = z.object({
  id: z.number().int(),
  region_id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  kind: z.string(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  public_phone: z.string().nullable(),
  public_email: z.string().nullable(),
  last_verified_on: z.string().nullable(),
  categories: z.array(z.string()),
  attributes: attributesSchema,
  counties_served: z.array(z.string()),
  county_coverage: z.array(countyCoverageSchema),
  locations: z.array(locationSchema),
  hours: z.array(hoursEntrySchema),
  // optional() as well as nullable() so parsing also succeeds against a
  // database where the v1.4 view update (appended parent_id) has not
  // been run yet; after the migration the key is always present.
  parent_id: z.number().int().nullable().optional(),
});

// The schedule JSON from published_meetings (meetings path, later phase)
// is validated with the same schema shape kept ready here.
export const scheduleEntrySchema = z.object({
  day: z.enum(WEEKDAYS),
  start: z.string(),
  duration_minutes: z.number().int(),
  weeks_of_month: z.array(z.number().int()).nullable(),
});

export type Resource = z.infer<typeof resourceSchema>;
export type ResourceLocation = z.infer<typeof locationSchema>;
export type HoursEntry = z.infer<typeof hoursEntrySchema>;
export type CountyCoverage = z.infer<typeof countyCoverageSchema>;
export type CrisisLine = {
  id: number;
  slug: string;
  label: string;
  phone: string;
  description: string | null;
  url: string | null;
  is_24_7: boolean;
  sort_order: number;
};
export type TopicCategory = { slug: string; name: string };
export type Topic = {
  id: number;
  slug: string;
  label: string;
  description: string | null;
  categories: TopicCategory[];
};
export type County = { fips: string; name: string; state_code: string };

/** Lists fall back to empty and log — pages stay renderable. */
type Fallback<T> = { data: T; dbError: boolean };

// ---------------------------------------------------------------------------
// Client (anon key only; created lazily so a missing env never breaks build)
// ---------------------------------------------------------------------------

let cached: SupabaseClient | null = null;

function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.",
    );
  }
  cached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

// Service-role client — server routes only, never imported by client
// components, never bundled for the browser.
let serviceCached: SupabaseClient | null = null;

function serviceDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.",
    );
  }
  serviceCached ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceCached;
}

function warn(scope: string, error: unknown) {
  console.error(`[db] ${scope}:`, error instanceof Error ? error.message : error);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export async function getCrisisLines(): Promise<Fallback<CrisisLine[]>> {
  try {
    const { data, error } = await db()
      .from("crisis_lines")
      .select(
        "id, slug, label, phone, description, url, is_24_7, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return { data: (data ?? []) as CrisisLine[], dbError: false };
  } catch (e) {
    warn("getCrisisLines", e);
    return { data: [], dbError: true };
  }
}

const topicRowSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sort_order: z.number().int(),
  topic_categories: z.array(
    z.object({
      categories: z
        .object({ id: z.number().int(), slug: z.string(), name: z.string() })
        .nullable(),
    }),
  ),
});

export async function getTopics(): Promise<Fallback<Topic[]>> {
  try {
    const { data, error } = await db()
      .from("plain_language_topics")
      .select(
        "id, slug, label, description, sort_order, topic_categories(categories(id, slug, name))",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const rows = z.array(topicRowSchema).parse(data ?? []);
    return {
      data: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        label: r.label,
        description: r.description,
        categories: r.topic_categories
          .map((tc) => tc.categories)
          .filter((c): c is NonNullable<typeof c> => c !== null),
      })),
      dbError: false,
    };
  } catch (e) {
    warn("getTopics", e);
    return { data: [], dbError: true };
  }
}

export async function getCountiesInRegion(): Promise<Fallback<County[]>> {
  try {
    const { data, error } = await db()
      .from("counties")
      .select("fips, name, state_code")
      .eq("in_region", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return { data: (data ?? []) as County[], dbError: false };
  } catch (e) {
    warn("getCountiesInRegion", e);
    return { data: [], dbError: true };
  }
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function parseResources(rows: unknown): Resource[] {
  const parsed = z.array(resourceSchema).safeParse(rows);
  if (!parsed.success) {
    warn("parseResources", parsed.error.issues.slice(0, 5));
    return [];
  }
  return parsed.data;
}

export type SearchParams = {
  q?: string;
  topic?: string;
  county?: string;
};

export async function searchResources(
  params: SearchParams,
): Promise<Fallback<Resource[]>> {
  try {
    const { data, error } = await db().rpc("search_resources", {
      q: params.q?.trim() ?? "",
      topic: params.topic || null,
      county: params.county || null,
    });
    if (error) throw error;
    return { data: parseResources(data), dbError: false };
  } catch (e) {
    warn("searchResources", e);
    return { data: [], dbError: true };
  }
}

export async function getResourceBySlug(
  slug: string,
): Promise<Resource | null> {
  try {
    const { data, error } = await db()
      .from("published_resources")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const parsed = resourceSchema.safeParse(data);
    if (!parsed.success) {
      warn("getResourceBySlug", parsed.error.issues.slice(0, 5));
      return null;
    }
    return parsed.data;
  } catch (e) {
    warn("getResourceBySlug", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Submissions — inserted ONLY by the server route (src/app/api/submissions)
// via the service-role client, with Turnstile and rate limiting applied
// there. The anonymous INSERT policy was removed in the v1.4 migration;
// this module no longer writes through the anon client.
// ---------------------------------------------------------------------------

export type SubmissionKind = "new_listing" | "update_listing" | "correction";

export async function countRecentSubmissionsByIp(
  sourceIpHash: string,
  windowHours = 1,
): Promise<number> {
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const { count, error } = await serviceDb()
    .from("submissions")
    .select("id", { count: "exact", head: true })
    .eq("source_ip_hash", sourceIpHash)
    .gte("created_at", since);
  if (error) throw error;
  return count ?? 0;
}

export async function resolveRegionId(
  organisationId?: number,
  regionId?: number,
): Promise<number> {
  if (regionId) return regionId;
  if (organisationId) {
    const { data, error } = await serviceDb()
      .from("organisations")
      .select("region_id")
      .eq("id", organisationId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data.region_id;
  }
  const { data, error } = await serviceDb()
    .from("regions")
    .select("id")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw error ?? new Error("No region exists to attach a submission to.");
  }
  return data.id;
}

export async function createSubmission(input: {
  regionId: number;
  kind: SubmissionKind;
  organisationId?: number;
  payload: Record<string, unknown>;
  submitterName?: string;
  submitterEmail?: string;
  submitterOrgRole?: string;
  sourceIpHash?: string;
}): Promise<void> {
  const { error } = await serviceDb().from("submissions").insert({
    region_id: input.regionId,
    kind: input.kind,
    status: "pending",
    organisation_id: input.organisationId ?? null,
    payload: input.payload,
    submitter_name: input.submitterName ?? null,
    submitter_email: input.submitterEmail ?? null,
    submitter_org_role: input.submitterOrgRole ?? null,
    source_ip_hash: input.sourceIpHash ?? null,
  });
  if (error) throw error;
}
