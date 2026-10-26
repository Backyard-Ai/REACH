<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Import spec (monthly refresh)

Rules approved in Nick's October 2026 schema review. The importer itself
is future work — this records the spec it must implement:

- Vanished UID (present in the database, absent from the new file):
  `status='draft'` + `needs_review=true`. Never deleted, never quietly
  left published — and, per the review, no longer visible on the site
  while awaiting review (stronger than the schema file's comment, which
  predates the decision).
- Blast-radius guard: if more than 10% of rows would vanish in one run,
  halt and alert. Do not import.
- Reappearing UID: back in as draft + needs_review. Never auto-republish
  — a human publishes.
- Phase 1 starts from schema v1.3.1 + the v1.4 migration, not from
  import_trial.py's column list (see that file's header note).

Partner access (near-term): per-partner read-only database role with
SELECT on published_resources and published_meetings only; CSV export
until a partner actually asks. Don't build the roles now.

## Directus ops notes (2026-10-12, first successful bootstrap)

- Pooler usernames MUST carry the project suffix: `directus.<ref>`,
  not `directus` — Supavisor routes by it (ENOIDENTIFIER otherwise).
- Bootstrapping over a flaky long-haul link fails: Directus's ~100
  migrations each cost a round-trip and interruptions wedge its
  bookkeeping ("column already exists" loops). Procedure that worked:
  bootstrap locally (`docker-compose.directus-bootstrap.yml`, empty
  local Postgres), `pg_dump --inserts --no-owner --no-privileges`,
  strip `\restrict` lines, restore to production as the directus role
  in one transaction. Filter `^\\` from the dump — psql meta-commands
  break non-psql drivers.
- Post-relocation, the directus role needs
  `search_path = public, extensions` (ALTER ROLE … SET) AND the
  compatibility views in `sql/005_directus_postgis_compat.sql`, or
  Directus introspection dies on geometry_columns/geography_columns.
- directus_* tables are owned by the directus role: schema surgery on
  them (drops, column fixes) must run connected AS directus.

## Ops runbook: bulk data loads over the flaky link (2026-10-14)

The importer (`web/scripts/import-master.ts`) is correct but cannot run
directly against production from this network: one transaction, ~2,500
sequential round-trips, 20+ minutes — the long-haul link resets before it
commits. It rolls back cleanly; retries just repeat the gamble. The working
pattern (used for the production import of 2026-10-14):

1. Run the importer against the local throwaway container
   (`TARGET_DATABASE_URL=postgres://postgres:…@localhost:<port>/postgres`).
   Local runs finish in seconds and produce the identical validated state.
2. `pg_dump --inserts --no-owner --no-privileges --data-only -t <tables>`
   from the container. Strip lines starting with `\` — pg_dump 17 emits
   `\restrict` psql meta-commands that break non-psql drivers.
3. Transform the dump: append `ON CONFLICT DO NOTHING` to every INSERT,
   and add `OVERRIDING SYSTEM VALUE` to INSERTs that carry an `id` column
   (schema v1.3.1 identity columns are GENERATED ALWAYS and reject
   explicit ids without it).
4. Restore to production as one small transaction PER TABLE, in
   dependency order, each retried with a fresh client:
   wipe + region shim → lookups → locations → organisations + links +
   contacts + service_areas → meetings → **import_runs BEFORE
   source_records** (FK on last_seen_run_id) → finalize (region remap,
   sequence setvals, delete shim).
   - The shim: container and production have different region ids
     (container 1, production 3). Insert a temporary region row with the
     container's id and a throwaway slug so inserts pass FK checks, remap
     `region_id` in the finalize phase, then delete the shim — one
     transaction boundaries be damned, it is all inside phases.
   - Never wipe or restore: regions, crisis_lines, submissions — outside
     the importer's domain and live only in production.
5. Sequences: after restore, `setval(pg_get_serial_sequence(...), max(id))`
   for every table with an identity column, or the next insert collides.
6. Re-run the verification battery (orgs/locations/series/schedules/
   contacts/service_areas/source_records/import_runs/published_resources)
   — it must match the container exactly; the transform is deterministic.

Gotchas recorded for posterity: zsh does not word-split unquoted variables
(`${=VAR}` or die confusing deaths); pg_dump arg lists built in loops must
run inside the container's shell; a tool-killed restore process can linger
holding transaction locks — check `pg_stat_activity` without an
application_name filter and terminate before retrying.

Production bookkeeping honesty: import_runs on production is the container
run that produced the loaded state (added=318, unchanged=0), stamped as
run 1; subsequent monthly refreshes diff against it normally.

## Inspect instance (8057) recovery

Recreating `reach_import_validation` breaks the Directus inspect instance
two ways: the new container isn't on the `reach-inspect` network, and its
fresh database has no directus_* tables. Recovery:
`docker network connect reach-inspect reach_import_validation && docker restart reach_directus_inspect`,
wait for ping, then re-run the polish pass (icons/notes/hidden PATCH —
see the script history in this file's sibling commits; auto-adopt handles
collections, not polish).
