# Northeast Tennessee Reach — web

Mobile-first recovery resource directory for ten Northeast Tennessee
counties (REACH project, ETSU-affiliated). Next.js 16 (App Router,
TypeScript strict) + Tailwind v4 + Supabase Postgres, targeting WCAG 2.1
AA / Section 508.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable                     | Used by                    | Notes                                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------------------ |
| `SUPABASE_URL`               | `src/lib/db.ts` (server)   | Project URL, e.g. `https://xxxx.supabase.co`                 |
| `SUPABASE_ANON_KEY`          | `src/lib/db.ts` (server)   | Publishable key. RLS gates every read; never sent to browser |
| `SUPABASE_SERVICE_ROLE_KEY`  | `scripts/seed.ts` only     | **Never** in app code or the client bundle                   |

All app data access is server-side (server components + server actions) —
no Supabase key of any kind ships to the browser.

## First-time setup

1. **Database** — deploy `../schema_v1.3.1.sql` (the frozen v1.3.1 schema)
   in the Supabase SQL Editor. 25 tables, 2 views, RLS everywhere.
2. **Search RPC** — run `sql/001_search_resources.sql` in the SQL Editor.
   This is the *only* database object the app adds beyond the schema: a
   single function that runs full-text + trigram + synonym search inside
   Postgres and returns `published_resources` rows.
3. **Known issue** — `sql/002_spatial_ref_sys_rls.sql` documents an
   ownership defect we cannot fix from user roles: dashboard-installed
   PostGIS leaves `spatial_ref_sys` owned by `supabase_admin` with anon
   write privileges and no RLS. Supabase support ticket filed; the
   script's statements run only as the owner. See the file for the
   verification probes.
4. **Install & env** — `npm install`, then create `.env.local` as above.
5. **Seed** — `npx tsx scripts/seed.ts` (see below).
6. **Dev / build** — `npm run dev`, `npm run build`, `npm run lint`.

## The demo seed

`npx tsx scripts/seed.ts` — idempotent (upserts; safe to re-run).

It loads the canonical lookup data plus three **sample** organisations so
the pages render:

- region `netn-reach`
- the **14 categories** with the source spreadsheet's exact names
  (`Advocacy Organizations` … `Treatment Services`)
- the **7 plain-language topics** and their topic→category mapping
  (proposal §4)
- the **NETN-10 counties** by Census-verified FIPS (`in_region = true`):
  47019 Carter, 47029 Cocke, 47059 Greene, 47063 Hamblen, 47067 Hancock,
  47073 Hawkins, 47091 Johnson, 47163 Sullivan, 47171 Unicoi,
  47179 Washington
- the **4 crisis lines** (TN REDLINE 800-889-9789, 988, Statewide Crisis
  Line 855-274-7471, 911) — `verified_on` stays NULL until the
  pre-launch re-verification against TDMHSAS
- 3 published sample orgs in/around Johnson City, including one
  coverage-only org (no address) to exercise the "serves your whole
  county" band. Sample rows carry `legacy_uids = ['SEED:<slug>']` — the
  real UID-master import replaces them.

## Architecture rules (keep these true)

- Public reads go **only** through the `published_resources` /
  `published_meetings` views and the RLS-exposed lookup tables, always via
  `src/lib/db.ts`. No queries in components.
- Search/filtering runs **inside Postgres** (the `search_resources` RPC
  uses the schema's full-text, trigram and synonym machinery). The
  dataset is never downloaded to the client.
- Crisis numbers come from the `crisis_lines` table, never hardcoded.
- JSON fields from the views (`locations`, `hours`, `county_coverage`,
  `schedule`) are zod-validated at the `lib/db.ts` boundary.
- The "this information is wrong" flow inserts into `submissions`
  (`kind='correction'`, `status='pending'`) through the anon-key client —
  exactly what the RLS INSERT policy permits.
- Brand tokens live in `src/app/globals.css` as CSS custom properties
  with the guide's exact names. Reach Teal is decorative on light
  backgrounds only; links/buttons use Mountain Teal or Phoenix Purple;
  crisis red is for crisis banners/buttons only.
- Directus is a separate service and is not part of this codebase.

## Not built yet (later phases)

Interactive map (MapLibre GL), the meetings path, the submission form
wizard, Directus integration, AI Navigator embed, stories, Power BI.
Those routes exist as empty states only.
