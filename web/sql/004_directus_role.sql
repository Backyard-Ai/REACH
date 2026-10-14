-- =====================================================================
-- Directus database role — supabase_setup.md §6, run in the Supabase
-- SQL Editor BEFORE connecting any Directus instance. Safe to re-run.
--
-- ⚠ BEFORE FIRST RUN: replace <PASTE-PASSWORD-HERE> below with a
-- generated value (openssl rand -hex 24), stored in the project vault
-- and reused as Directus's DB_PASSWORD. The SQL Editor does no
-- substitution. On re-runs the guarded block skips, so the placeholder
-- no longer matters. To rotate later: ALTER ROLE directus PASSWORD '…';
--
-- Directus needs more than RLS allows (it manages its own directus_*
-- tables AND edits content), so it gets a dedicated login role that
-- bypasses RLS — NOT the service_role key, NOT the postgres superuser.
--
-- Deliberately ABSENT vs supabase_setup.md §6's original sketch: the two
-- ALTER DEFAULT PRIVILEGES FOR ROLE directus statements. They cannot be
-- run from the SQL Editor (altering another role's defaults requires
-- being that role; postgres is not a member of directus), and both are
-- no-ops for this design anyway: creators own what they create (the
-- GRANT ... TO directus), and Supabase's anon/authenticated defaults are
-- per-creator-role, so directus-created tables inherit nothing to revoke
-- (the REVOKE). The real isolation proof is the post-bootstrap check:
-- GET /rest/v1/directus_users with the anon key must be denied.
-- =====================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'directus') THEN
        EXECUTE 'CREATE ROLE directus LOGIN PASSWORD '
                || quote_literal('<PASTE-PASSWORD-HERE>')
                || ' BYPASSRLS';
    END IF;
END;
$$;

GRANT CONNECT ON DATABASE postgres TO directus;
-- CREATE matters: Directus lays down its directus_* system tables in
-- public on first boot, and modern Supabase no longer grants PUBLIC
-- create on the schema.
GRANT USAGE, CREATE ON SCHEMA public TO directus;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO directus;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO directus;

-- Directus's own connection needs the extensions schema on its path
-- (PostGIS lives there post-relocation; its introspection queries
-- geometry_columns/geography_columns unqualified). Applied 2026-10-12;
-- recorded here so the next environment gets it from the start.
ALTER ROLE directus SET search_path = public, extensions;

-- Future app migrations (v1.5+) run as postgres in the SQL Editor.
-- Default privileges are per-creator-role: without these, any table a
-- future migration creates would be invisible to Directus — the
-- "where did my table go in the admin?" failure. (These run fine as
-- postgres: we ARE the postgres role in the SQL Editor.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO directus;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO directus;

-- Post-relocation note (once Supabase support moves PostGIS): the
-- extensions schema holds PostGIS objects Directus must be able to
-- call through table columns; grant usage without write.
GRANT USAGE ON SCHEMA extensions TO directus;
