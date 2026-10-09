-- =====================================================================
-- Directus database role — supabase_setup.md §6, run once in the
-- Supabase SQL Editor BEFORE connecting any Directus instance.
--
-- Directus needs more than RLS allows (it manages its own directus_*
-- tables AND edits content), so it gets a dedicated login role that
-- bypasses RLS — NOT the service_role key, NOT the postgres superuser.
--
-- Replace :password with a generated value (e.g. `openssl rand -hex 24`)
-- and store it in the project vault — it goes into the Directus
-- DB_PASSWORD env var.
-- =====================================================================

CREATE ROLE directus LOGIN PASSWORD ':password' BYPASSRLS;

GRANT CONNECT ON DATABASE postgres TO directus;
GRANT USAGE ON SCHEMA public TO directus;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO directus;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO directus;
ALTER DEFAULT PRIVILEGES FOR ROLE directus IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO directus;

-- Critical: Directus creates directus_* tables in public AFTER our
-- schema ran, and Supabase's default privileges would expose new
-- public-schema tables to the API roles. Strip that inheritance:
ALTER DEFAULT PRIVILEGES FOR ROLE directus IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- Post-relocation note (once Supabase support moves PostGIS): the
-- extensions schema holds PostGIS objects Directus must be able to
-- call through table columns; grant usage without write:
GRANT USAGE ON SCHEMA extensions TO directus;
