# REACH Resource Directory — build brief for opencode

You are building a mobile-first recovery resource directory for ten Northeast  
Tennessee counties (the REACH project, ETSU-affiliated, state-funded). Three  
audiences: people seeking recovery, people helping them, and professionals.  
WCAG 2.1 AA / Section 508 is a hard requirement, not a nice-to-have.

## Sources of truth — read these first, in this order

1. `03_plain_english.md` — the data model in plain English (read fully).
2. `schema.sql` — v1.3, already validated on real PostgreSQL 15 + PostGIS 3.4.  
   25 tables, RLS on every table, and two views — `published_resources` and  
   `published_meetings` — that are the ONLY read contract for public data.  
   Treat the schema as frozen: do not modify it, do not invent columns.  
   If something you need is missing, stop and ask instead of working around it.
3. `proposal.md` — page structure (section 4) and brand implementation  
   (section 6). Follow the page structure; keep navigation to four items:  
   Get Help · Find Resources · For Professionals · About.

## Brand (hard constraints)

- Tokens: --brand-primary #24114D (Phoenix Purple), --brand-action #177A8C  
  (Mountain Teal), --brand-accent #14B7C1 (Reach Teal), --surface #F2F2F2/#FFF,  
  --text-body #2B2B33, --crisis #8C1D2F (crisis banners ONLY).
- Reach Teal is decorative on light backgrounds — never text or interactive  
  elements on white/Mist Gray (fails contrast). Links/buttons: Mountain Teal  
  or Phoenix Purple. On purple: white or Reach Teal.
- Fonts (Google Fonts): League Spartan Bold headlines, Merriweather subheads,  
  Source Sans 3 body at 16px minimum, Satisfy only as rare accent.
- 44×44px minimum touch targets, 2px Mountain Teal focus ring with 2px offset,  
  hover darken 10%, fully operable keyboard-only and at 200% zoom.
- Person-first language everywhere: "person in recovery", never "addict",  
  "abuser", "clean/dirty".

## Stack

Next.js (App Router, TypeScript strict), Supabase Postgres via the anon key,  
MapLibre GL (later phase), Vercel. Tailwind is fine; brand tokens as CSS  
custom properties with exactly the names above. No component library that  
fights the brand. Directus is a separate service — NOT part of this codebase.

## Hard rules

- Frontend reads ONLY through `published_resources` / `published_meetings`  
  and the RLS-exposed lookup tables (categories, plain_language_topics,  
  topic_categories, attributes, crisis_lines, counties, meeting_types,  
  search_synonyms). All through one server-side data-access module  
  (`lib/db.ts`) with typed queries — no queries inside components, no  
  service-role key anywhere near client code.
- All search, filtering and geographic queries run server-side in Postgres  
  (full-text + trigram indexes already exist; PostGIS for distance).  
  Never download the dataset to the client.
- Browse surfaces use the plain-language layer (plain_language_topics joined  
  through topic_categories onto categories). The professional taxonomy  
  appears only in the For Professionals filter set.
- Crisis numbers come from the `crisis_lines` table, never hardcoded.
- Map (when built) always has a list equivalent for screen readers.
- zod-validate JSON fields from the views (locations, hours,  
  county_coverage, schedule) at the data-access boundary.
- Keep the build green: `npm run build` and `npm run lint` after each step.  
  Work incrementally, one page at a time, commit per page.

## Scope for THIS session: scaffold + core read path

Build these, in this order:

1. Next.js app (TypeScript, App Router, Tailwind), env var setup  
   (SUPABASE_URL, SUPABASE_ANON_KEY), Supabase client, `lib/db.ts`.
2. Design tokens + base layout: header (wordmark placeholder text "Northeast  
   Tennessee Reach", four nav items, Get Help Now button in crisis red),  
   footer (crisis line from crisis_lines, "Submit a listing" link, funding  
   acknowledgment placeholder).
3. Home: one search box (no dropdowns in the hero), four route cards  
   (I need help now · Help for myself · Helping someone else · I'm a  
   professional), browse by plain-language topic, map placeholder.
4. `/get-help`: crisis_lines ordered by sort_order, tel: one-tap dial for the  
   first three, 911 behind a deliberate tap-through showing its description,  
   then "what happens when you call" copy section.
5. `/resources`: server-side full-text search + filters (plain-language  
   topic, county), card list from published_resources, filter state in the  
   URL (shareable links). Include a "serving your whole county" band style  
   for listings with no address but county coverage.
6. `/resources/[slug]`: full detail from published_resources — categories,  
   description, locations (address + Google Maps directions link), tel:  
   phone, website, hours JSON rendered as a table, county coverage with  
   public_phone, last_verified_on shown prominently, and a "this information  
   is wrong" link that POSTs a stub to the submissions table  
   (kind='correction', status='pending', payload jsonb).
7. Seed script (`scripts/seed.ts`, service-role key, run once): region  
   'netn-reach'; ALL 14 categories — named exactly as the spreadsheet's
   tick-box columns, which are the source of truth: Advocacy Organizations,
   Collegiate Recovery Programs, Drug/Recovery Courts, Harm Reduction
   Organizations, Mutual-Aid Organizations, Peer Recovery Services,
   Prevention Organizations, Recovery Community Centers, Recovery Community
   Organizations, Recovery High Schools, Recovery Informed Institutional
   Services, Recovery Residences, Re-Entry Services Organizations,
   Treatment Services. The docs' "13 categories" is the IN-USE count —
   Recovery High Schools is the empty one, and Treatment Services IS a
   category (79 rows, legacy prefix TS). Do not merge or rename any of
   them; the 7 plain-language topics with the  
   proposal's topic→category mapping (A place to stay→Recovery Residences;  
   Meetings near me→Mutual-Aid; Detox and treatment→Treatment Services;  
   Someone to talk to→Peer Recovery Services + Recovery Community Centers;  
   Staying safe→Harm Reduction; Help with court or re-entry→Recovery Courts
   - Re-Entry; Help at school→Collegiate Recovery + Recovery High Schools);  
     the NETN-10 counties by FIPS (47001 Anderson is NOT one — the ten are:  
     47019 Carter, 47059 Greene, 47073 Hancock, 47091 Johnson, 47089 Hawkins,  
     47063 Hamblen, 47029 Cocke, 47163 Sullivan, 47179 Washington, 47171  
     Unicoi); 4 crisis lines (TN REDLINE 800-889-9789; 988 Suicide & Crisis  
     Lifeline 988; Statewide Crisis Line 855-274-7471; 911 — is_24_7, verified_on  
     NULL); 3 sample organisations with locations in Johnson City TN (status  
     'published') so the pages render. Mark the seed clearly — the real import  
     replaces it.
8. Search: PostgREST cannot reach the tsvector/trigram indexes through
   the view, so implement `public.search_resources(q text, topic_slug text
   default null, county_fips text default null) RETURNS SETOF
   published_resources` as a separate, clearly-marked SQL file
   (`search.sql` — the schema itself stays frozen). Requirements:
   SECURITY INVOKER (the default — RLS must apply to the caller), STABLE,
   `SET search_path = ''` with public.-qualified references (advisor
   hygiene, same as schema v1.3.1); a row matches if
   search_tsv @@ websearch_to_tsquery('english', q) OR
   similarity(immutable_unaccent(name), q) > 0.25 OR q expands through
   search_synonyms (term match → that category/topic's organisations);
   apply topic (topic_categories → categories → organisation_categories)
   and county (locations' county_fips OR service_areas) as filters; order
   by rank. Call it from lib/db.ts via supabase.rpc(). Verify at deploy
   that EXECUTE is granted to anon/authenticated (Supabase default — but
   check).

Explicitly DO NOT build yet: the interactive map, the meetings path, the  
submission form wizard, Directus integration, the AI Navigator embed,  
stories, Power BI. Create empty-state routes only.

## Definition of done for this session

- Pages 2–6 render from the seed data, keyboard-navigable, at mobile width.
- Search finds a seeded organisation by partial/misspelled name.
- `npm run build` passes; no service-role key in the client bundle.
- README with env vars and how to re-run the seed.
