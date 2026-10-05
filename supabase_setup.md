# Supabase setup checklist — REACH directory

Order matters: do 1–4 before the schema import, 5–8 after, 9–10 at launch.

## 1. Project & ownership
- Create the Supabase org and project **under REACH's own account** (Nick's
  team owns it; you're a collaborator — per the proposal, they own everything).
- Region: **us-east-1** (N. Virginia) — closest to Tennessee.
- **Plan: Pro ($25/mo) — confirmed.** Automatic daily backups are included
  (Dashboard → Database → Backups; verify the schedule is on and note the
  retention window in the handoff doc). Pro also removes the free tier's
  pause-after-inactivity, which would have been a real risk for a
  crisis-resource site. PITR is a paid add-on — daily backups are enough at
  this data volume; skip it for now.

## 2. Deploy the schema
- SQL Editor → paste `schema.sql` **v1.3.1** → run. Expect COMMIT, 25 tables,
  2 views.
- Database → Extensions: confirm `postgis`, `pg_trgm`, `unaccent`, `citext`
  are enabled (the schema creates them; verify they landed).

## 3. API settings (Settings → API)
- **Exposed schemas: `public` only.** This is the Directus isolation layer —
  never add `directus` (or any other schema) here.
- Copy the **anon / publishable key** → goes in the frontend's public env
  (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Safe to expose: RLS gates everything.
- Copy the **service_role / secret key** → server-side only (import script,
  seed script). Never in client code, never in the repo.

## 4. Auth (Authentication → Sign In / Up)
- **Disable "Allow new users to sign up"** — the public never has accounts.
  Submissions are anonymous INSERTs into the queue, not auth users.
- Disable anonymous sign-ins if offered. No OAuth providers needed.
- You don't need Supabase Auth for this build at all — admin lives in
  Directus, which has its own auth.

## 5. After the import runs — Advisors (Dashboard → Advisors)
- Run the **Security Advisor** (Nick explicitly asked for this; run it again
  before handoff). Expected: clean. v1.3 added explicit deny-read policies to
  kill the "RLS enabled, no policy" warnings, and v1.3.1 pins
  `SET search_path = ''` on all four functions, so the usual
  "function search_path mutable" findings should not appear either. If
  anything does show up, treat it as a defect in the schema file, not
  something to click through.

## 6. Database roles for the two server-side consumers
The import script and Directus both need more than RLS allows. Create one
dedicated login role each — don't hand out service_role or the postgres
superuser:

```sql
-- Import/seed scripts: full read-write on public content, bypasses RLS.
CREATE ROLE reach_import LOGIN PASSWORD '<generate>' BYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO reach_import;
GRANT USAGE ON SCHEMA public TO reach_import;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO reach_import;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO reach_import;
ALTER DEFAULT PRIVILEGES FOR ROLE reach_import IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO reach_import;

-- Directus: creates its own directus_* tables AND edits content.
CREATE ROLE directus LOGIN PASSWORD '<generate>' BYPASSRLS;
GRANT CONNECT ON DATABASE postgres TO directus;
GRANT USAGE ON SCHEMA public TO directus;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO directus;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO directus;
ALTER DEFAULT PRIVILEGES FOR ROLE directus IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO directus;
-- Critical: Directus creates directus_* tables in public AFTER our schema
-- ran, and Supabase's default privileges would expose new public-schema
-- tables to the API roles. Strip that inheritance for tables Directus creates:
ALTER DEFAULT PRIVILEGES FOR ROLE directus IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
```

- Directus connects via the **direct connection** (port 5432) or the session
  pooler — it's a long-lived server process.
- The Next.js app on Vercel connects via PostgREST (the anon key), so no DB
  connection string needed there. If any server code needs raw SQL, use the
  **transaction pooler** (port 6543) — serverless functions exhaust direct
  connections.

## 7. After Directus is installed — one verification
Directus will have created `directus_users`, `directus_sessions`, etc. in
`public`. Confirm the API can't see them:
```sql
SELECT tablename FROM pg_tables
 WHERE schemaname='public' AND tablename LIKE 'directus_%';
-- then spot-check with the anon key (Settings → API → try the REST endpoint):
-- GET /rest/v1/directus_users must return a permission error, not rows.
```
If anything leaks, run:
```sql
DO $$ DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables
           WHERE schemaname='public' AND tablename LIKE 'directus_%'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
```

## 8. Storage (later, for story photos)
- Only when Stories ship: create a `story-photos` bucket, **private**,
  uploads via Directus/server only, public reads only through signed URLs or
  after consent_on_file = true. Do not create it now.

## 9. Before launch
- [ ] Security Advisor: zero unresolved warnings (screenshot for the handoff doc).
- [ ] Crisis lines: `verified_on` set to the re-verification date on all 4 rows.
- [ ] Backups: confirm daily backup schedule is active and note retention
      (Pro — included; see item 1).
- [ ] Free-tier limits: N/A on Pro — check compute/egress against expected
      traffic at launch instead (Pro allowances are generous for this
      dataset; no action expected).
- [ ] Supabase, Vercel, Directus, GitHub all under REACH-owned accounts with
      you as collaborator, and 2FA on all of them.

## 10. What NOT to touch
- Don't enable Supabase Auth providers, Realtime, or Edge Functions "just in
  case" — the architecture doesn't use them, and every enabled surface is one
  more thing to secure.
- Don't relax any RLS policy to "make the query work" — if the anon key can't
  read something the site needs, the fix is a view or a policy written for
  that need, never a broader grant.
