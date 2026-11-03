# REACH — Handover Guide

**Northeast Tennessee REACH (Recovery Ecosystem – Access to Care and Health)**
Recovery resource directory for ten Northeast Tennessee counties.
Built by Silvia Barros / Bandida Tech Pte. Ltd., handed over to Nick/BackyardAI.

---

## Start here

This document is the map. It tells you what exists, where it lives,
and what you need to do to keep it running.

| Document | What it covers |
|---|---|
| **This file** | System overview, accounts, architecture, runbooks |
| `web/README.md` | Technical setup, env vars, how to run locally |
| `web/AGENTS.md` | Ops runbooks (restore, inspect recovery, import spec, Directus notes) |
| `supabase_setup.md` | Supabase checklist (original setup, still useful for reference) |
| `web/docs/admin-guide.md` | Guide for Directus editors (reviewers, admins) |

---

## What the system is

A mobile-first recovery resource directory with three audiences:

1. **People seeking recovery** — search, map, meetings, crisis lines
2. **People helping them** — family support, plain-language browse
3. **Professionals** — taxonomy filters, deterministic export, chatbot

**Live URL:** https://reach-chi-lyart.vercel.app
**Directus admin:** https://reach-directus.fly.dev
**Custom domains** (pending DNS): netnreach.com, netnreach.org, tnreach.org

---

## Accounts and credentials

| Service | What it does | Owner | Where credentials live |
|---|---|---|---|
| **GitHub** | Code repository | REACH (Backyard-Ai org) | https://github.com/Backyard-Ai/REACH |
| **Vercel** | Website hosting | REACH (Nick's account) | Vercel dashboard, shared access |
| **Supabase** | Database (Postgres + PostGIS) | REACH | Supabase dashboard, shared access |
| **Fly.io** | Directus admin hosting | REACH (Nick's org: nick-swope) | Fly.io dashboard |
| **Cloudflare** | Turnstile (spam protection) | REACH | Cloudflare dashboard |
| **CustomGPT** | AI Navigator chatbots | Backyard AI | Nick's account |

> **All accounts are under REACH/Backyard-AI ownership.**

### Environment variables

All configuration lives in environment variables, never in code.

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | Website (server) | Supabase project URL |
| `SUPABASE_ANON_KEY` | Website (server) | Public key — safe, RLS gates everything |
| `SUPABASE_SERVICE_ROLE_KEY` | Submissions route + seed | **Never** in client code |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Correction form | Build-time inlined — redeploy after change |
| `TURNSTILE_SECRET_KEY` | Submissions route | Optional; absent = skip verification |
| `IP_HASH_SALT` | Submissions route | Salt for rate-limit IP hashing |
| `ADMIN_ACTION_TOKEN` | Accept API fallback | Shared secret for /api/admin/accept |

Local development uses `web/.env.local` (gitignored — never committed).

---

## Architecture (one diagram)

```
┌──────────────────────────────────────────────────────────────┐
│                       THE INTERNET                            │
└─────────────────────────┬────────────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
   ┌──────────────┐ ┌──────────┐ ┌───────────┐
   │    VERCEL    │ │  FLY.IO  │ │ CustomGPT │
   │  (Next.js)   │ │(Directus)│ │  (2 bots) │
   │  Website     │ │  Admin   │ │  Chatbots │
   └──────┬───────┘ └────┬─────┘ └─────┬─────┘
          │              │             │
          └──────────────┼─────────────┘
                         ▼
               ┌───────────────────┐
               │     SUPABASE      │
               │   PostgreSQL 17   │
               │     + PostGIS     │
               │                   │
               │ 25 tables (RLS)   │
               │ 2 published views│
               │ search_resources  │
               │ reach-kb Edge Fn  │
               └───────────────────┘
```

**Key principle:** all public data flows through two database views —
`published_resources` and `published_meetings`. The website reads only
these views plus public lookup tables. Nothing unpublished is ever visible.

---

## Daily operations

### Reviewing submissions (Directus)

The most common task. Submissions arrive from the public form and land
in the review queue.

1. Log in to https://reach-directus.fly.dev
2. Content → Submissions
3. Click a pending submission, read the payload
4. **For new listings:** change Status to `Approved` — the organisation
   is created automatically as a draft (PostgreSQL trigger)
5. **For corrections:** read the issue, find the organisation, make the
   edit manually, then mark the submission `Approved` or `Rejected`
6. Go to Organisations → find the new draft → change Status to
   `Published`

Detailed guide: `web/docs/admin-guide.md`

### Monthly data refresh

> **Prefer editing directly in Directus.** If the team adds and updates
> listings through Directus (or the public submission form), this step is
> unnecessary — changes go live immediately. The spreadsheet import is
> only needed if the team continues producing a master spreadsheet as
> the source of truth.

When a new master spreadsheet arrives:

1. Update `web/.env.local` if connection strings have changed
2. Test the importer: `cd web && npx tsx scripts/import-master.ts --dry-run`
3. Verify the expected numbers (rows, orgs, flags)
4. Run the real import against the throwaway container first
5. If good, restore to production (see `web/AGENTS.md` → Ops Runbook)
6. After the import: refresh both CustomGPT bots (re-crawl sitemap)

### Publishing / unpublishing a listing

In Directus → Organisations → find the listing → change Status:
- `draft` = not visible on the site
- `published` = visible everywhere (site, map, search, export, chatbots)
- `archived` = removed from public view but preserved in the database

Changes are reflected on the site immediately.

---

## Deployment

### Website (Vercel)

The site deploys automatically when code is pushed to `main` on GitHub.

```
git push origin main  →  Vercel builds and deploys  →  live in ~3 minutes
```

To redeploy without code changes: Vercel dashboard → Deployments →
most recent → ⋯ → Redeploy.

### Directus (Fly.io)

Directus runs as a Docker container on Fly.io.

```bash
fly deploy --app reach-directus    # redeploy
fly logs --app reach-directus      # view logs
fly status --app reach-directus    # health check
```

Configuration is in `fly.toml` at the repo root. Secrets are set via
`fly secrets set` (they live in Fly.io, not in the repo).

### Edge Function (Supabase)

The `reach-kb` function serves knowledge pages for the chatbots.

```bash
cd REACH
supabase functions deploy reach-kb --no-verify-jwt
```

Verify: `https://htzmessdmdtonjybqvth.supabase.co/functions/v1/reach-kb/sitemap.xml`
should return XML with ~344 links.

---

## Database

### Connection

- **Project ref:** `htzmessdmdtonjybqvth`
- **Region:** us-west-2
- **Host:** `aws-0-us-west-2.pooler.supabase.com`
- **Port:** 5432 (session pooler)
- **Database:** `postgres`

Connection strings use the format `postgres://<user>.<ref>:<password>@<host>:5432/postgres`.
The `web/.env.local` file contains the working connection string.

### Key tables

| Table | Purpose |
|---|---|
| `organisations` | The listings (318) — status controls visibility |
| `locations` | Physical addresses (263 places, shared venues) |
| `service_areas` | County coverage (separate from address) |
| `submissions` | Public review queue |
| `categories` | 14 professional taxonomy categories |
| `plain_language_topics` | 10 browse topics shown on the home page |
| `search_synonyms` | 284 terms → category/topic mappings |
| `crisis_lines` | 4 crisis numbers (verified dates tracked) |
| `import_runs` | One row per monthly refresh |
| `source_records` | Maps source UIDs to database rows |

### Row-level security

Every table has RLS enabled. The public site (anon key) can only read
published data through the two views. Four tables (`contacts`,
`practitioner_notes`, `source_records`, `import_runs`) are fully private.

---

## Code structure

```
web/                          Next.js application
├── src/app/                  Pages and API routes
│   ├── page.tsx              Home
│   ├── get-help/             Crisis lines
│   ├── resources/            Search + list + map + detail
│   ├── meetings/             Meeting schedules
│   ├── professionals/        Taxonomy + export
│   ├── submit/               Submission wizard
│   └── api/                  Server routes
├── src/lib/db.ts             Data access layer (all queries)
├── src/lib/format.ts         Formatting helpers
├── src/lib/map-points.ts     Map pin extraction
├── src/components/           Shared components
│   ├── resource-map.tsx      MapLibre map (every surface)
│   ├── resource-card.tsx     Listing card
│   ├── submission-wizard.tsx 4-step form
│   ├── navigator-button.tsx  CustomGPT floating button
│   └── ...
├── scripts/                  Operational scripts
│   ├── import-master.ts      Monthly importer
│   ├── accept-submission.ts  Terminal accept (fallback)
│   ├── run-sql.mjs           SQL runner
│   ├── directus-adopt.mjs    Directus collection setup
│   └── directus-permissions.mjs
├── sql/                      Database migrations
│   ├── 001_search_resources.sql
│   ├── 002_v1.4_migration.sql
│   ├── 003_spatial_ref_sys_rls.sql
│   ├── 004_directus_role.sql
│   ├── 005_directus_postgis_compat.sql
│   ├── 006_seed_attributes.sql
│   └── 007_auto_accept_trigger.sql
└── public/                   Static assets (logo, maplibre worker)

supabase/functions/reach-kb/  Edge Function (chatbot knowledge base)
edge-function/                Nick's original source
docker-compose.directus.yml   Local Directus (dev only)
fly.toml                      Fly.io deployment config
```

---

## Known issues and future work

| Item | Status | Notes |
|---|---|---|
| Navigator corner cosmetic | Low | White sliver between border and chatbot widget |
| 5 duplicate venue pairs | Data | Locations that should be merged (see schema docs) |
| Español search example | Data | Our copy of the July file doesn't contain "Español" |
| Stories | Phase 2 | Needs written consents |
| Power BI | Phase 2 | Dashboard embed |
| Near-me map feature | Phase 2 | PostGIS distance queries (infrastructure ready) |
| Domain setup | Pending | Nick needs to update DNS in Squarespace |

---

## Support

After handover, the optional monthly retainer covers fixes, small changes,
and keeping dependencies current. For questions about the codebase,
`web/AGENTS.md` has detailed operational notes from the build.

---

*Prepared by Silvia Barros / Bandida Tech Pte. Ltd. · November 2026*
