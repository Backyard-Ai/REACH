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
