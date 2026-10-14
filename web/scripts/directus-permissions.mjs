/**
 * Configures the Directus "Editor" role policy:
 *   - policy flags: app access ON, admin access OFF
 *   - system permissions: app-access minimum (own-scoped)
 *   - organisations: read + update (status excluded — publishing is admin)
 *   - submissions: read + update (review fields only)
 *   - junction tables: full CRUD   - lookups: read only
 *   - private tables: absent = no access
 *   - creates an editor-test user (password printed once)
 * Idempotent: re-running replaces the policy's permissions and reuses
 * the existing test user (password regenerated).
 *
 * Run: node scripts/directus-permissions.mjs   (reads .env.directus)
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.directus", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((l) => l.split("=")),
);

const BASE = "http://localhost:8055";
const EDITOR_TEST_EMAIL = "editor-test@example.com";

async function main() {
  const login = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: env.DIRECTUS_ADMIN_EMAIL,
      password: env.DIRECTUS_ADMIN_PASSWORD,
    }),
  });
  const token = (await login.json()).data.access_token;
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // --- locate or create role + policy + access link -------------------------
  // (the whole editorial model is reproducible from nothing)
  let roles = (await (await fetch(`${BASE}/roles?filter[name][_eq]=Editor`, { headers: H })).json()).data;
  let roleId = roles[0]?.id;
  if (!roleId) {
    const r = await fetch(`${BASE}/roles`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: "Editor", icon: "edit_note", description: "Edits listings; publishing is an admin action." }),
    });
    if (!r.ok) throw new Error(`role create failed: ${await r.text()}`);
    roleId = (await r.json()).data.id;
    console.log("created Editor role");
  }
  let policies = (await (await fetch(`${BASE}/policies?filter[name][_contains]=Editor`, { headers: H })).json()).data;
  let policyId = policies[0]?.id;
  if (!policyId) {
    const r = await fetch(`${BASE}/policies`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        name: "Editor — App Access",
        description: "Edits listings and moves the review queue along; publishing is an admin action.",
        icon: "badge", app_access: true, admin_access: false,
      }),
    });
    if (!r.ok) throw new Error(`policy create failed: ${await r.text()}`);
    policyId = (await r.json()).data.id;
    console.log("created Editor policy");
  }
  const links = (await (await fetch(`${BASE}/access?filter[role][_eq]=${roleId}&filter[policy][_eq]=${policyId}`, { headers: H })).json()).data;
  if (links.length === 0) {
    const r = await fetch(`${BASE}/access`, {
      method: "POST", headers: H,
      body: JSON.stringify({ role: roleId, policy: policyId }),
    });
    if (!r.ok) throw new Error(`access link create failed: ${await r.text()}`);
    console.log("linked policy to role");
  }
  console.log(`role: ${roleId} | policy: ${policyId}`);

  // --- policy flags ---------------------------------------------------------
  const patch = await fetch(`${BASE}/policies/${policyId}`, {
    method: "PATCH",
    headers: H,
    body: JSON.stringify({
      name: "Editor — App Access",
      description: "Edits listings and moves the review queue along; publishing is an admin action.",
      app_access: true,
      admin_access: false,
    }),
  });
  if (!patch.ok) throw new Error(`policy patch failed: ${await patch.text()}`);
  console.log("policy flags set: app_access=true, admin_access=false");

  // --- replace permissions --------------------------------------------------
  const existing = (await (await fetch(`${BASE}/permissions?filter[policy][_eq]=${policyId}&limit=-1`, { headers: H })).json()).data;
  for (const p of existing) {
    const d = await fetch(`${BASE}/permissions/${p.id}`, { method: "DELETE", headers: H });
    if (!d.ok) throw new Error(`failed deleting permission ${p.id}`);
  }
  console.log(`cleared ${existing.length} existing permissions`);

  const ORG_UPDATE_FIELDS = [
    "name", "kind", "description", "additional_info", "website",
    "public_phone", "public_email", "last_verified_on",
    "needs_review", "review_note", "legacy_uids",
  ];
  const SUB_UPDATE_FIELDS = ["status", "reviewed_by", "reviewed_at", "review_note"];
  const JUNCTION = [
    "organisation_categories", "organisation_locations", "service_areas",
    "organisation_hours", "organisation_attributes",
  ];
  const LOOKUPS = [
    "categories", "plain_language_topics", "counties", "crisis_lines",
    "locations", "meeting_types", "attributes", "regions",
    "search_synonyms", "meeting_series", "meeting_schedules",
    "meeting_series_types", "stories",
  ];
  const OWN = (field) => ({ [field]: { _eq: "$CURRENT_USER" } });

  const perms = [];
  // system: app-access minimum
  perms.push({ collection: "directus_activity", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_collections", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_fields", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_relations", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_comments", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_comments", action: "create", fields: ["*"] });
  perms.push({ collection: "directus_notifications", action: "read", fields: ["*"], permissions: OWN("recipient") });
  perms.push({ collection: "directus_notifications", action: "update", fields: ["*"], permissions: OWN("recipient") });
  perms.push({ collection: "directus_presets", action: "read", fields: ["*"] });
  for (const a of ["create", "update", "delete"]) {
    perms.push({ collection: "directus_presets", action: a, fields: ["*"], permissions: OWN("user") });
  }
  perms.push({ collection: "directus_roles", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_settings", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_shares", action: "read", fields: ["*"] });
  perms.push({ collection: "directus_shares", action: "create", fields: ["*"] });
  for (const a of ["read", "create", "update", "delete"]) {
    perms.push({ collection: "directus_translations", action: a, fields: ["*"] });
  }
  perms.push({ collection: "directus_users", action: "read", fields: ["*"], permissions: OWN("id") });
  perms.push({ collection: "directus_users", action: "update", fields: ["*"], permissions: OWN("id") });

  // app collections
  perms.push({ collection: "organisations", action: "read", fields: ["*"] });
  perms.push({ collection: "organisations", action: "update", fields: ORG_UPDATE_FIELDS });
  perms.push({ collection: "submissions", action: "read", fields: ["*"] });
  perms.push({ collection: "submissions", action: "update", fields: SUB_UPDATE_FIELDS });
  for (const t of JUNCTION) {
    for (const a of ["create", "read", "update", "delete"]) {
      perms.push({ collection: t, action: a, fields: ["*"] });
    }
  }
  for (const t of LOOKUPS) {
    perms.push({ collection: t, action: "read", fields: ["*"] });
  }

  const ins = await fetch(`${BASE}/permissions`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(perms.map((p) => ({ ...p, policy: policyId }))),
  });
  if (!ins.ok) throw new Error(`permission insert failed: ${(await ins.text()).slice(0, 300)}`);
  console.log(`installed ${perms.length} permissions (system + app collections)`);

  // --- test user -------------------------------------------------------------
  const testPw = randomBytes(12).toString("hex");
  const found = (await (await fetch(`${BASE}/users?filter[email][_eq]=${EDITOR_TEST_EMAIL}`, { headers: H })).json()).data;
  if (found.length > 0) {
    const u = await fetch(`${BASE}/users/${found[0].id}`, {
      method: "PATCH",
      headers: H,
      body: JSON.stringify({ password: testPw, role: roleId, status: "active" }),
    });
    if (!u.ok) throw new Error(`test user update failed: ${await u.text()}`);
  } else {
    const u = await fetch(`${BASE}/users`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        email: EDITOR_TEST_EMAIL,
        password: testPw,
        role: roleId,
        status: "active",
      }),
    });
    if (!u.ok) throw new Error(`test user create failed: ${await u.text()}`);
  }
  console.log(`\ntest editor: ${EDITOR_TEST_EMAIL} / ${testPw}`);
  console.log("log in with it (incognito) to verify: no private tables, status read-only, queue review-only");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
