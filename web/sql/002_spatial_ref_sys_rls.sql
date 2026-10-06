-- spatial_ref_sys hardening — CURRENTLY BLOCKED BY OWNERSHIP.
--
-- Context (verified 2026-10-07):
--   * PostGIS on this project was installed via the Supabase dashboard,
--     so public.spatial_ref_sys is owned by supabase_admin.
--   * No user-reachable role (SQL Editor and pooler both connect as
--     postgres) can ALTER / CREATE POLICY / GRANT / REVOKE on it
--     (ERROR 42501), and DROP EXTENSION postgis is owner-gated too.
--     The Security Advisor's own "Enable RLS" button fails the same way.
--   * Meanwhile the anon role holds full write privileges on the table
--     through default grants — an anon-key INSERT reaches the primary
--     key (SQLSTATE 23505, not 42501). Bounded exposure: the anon key
--     is never shipped client-side, nothing on the anon path reads this
--     table (ST_X/ST_Y/ST_DWithin on stored 4326 geography do not
--     consult the CRS catalog), and it contains only public EPSG
--     reference data.
--
-- Remediation: Supabase support has been asked to run the statements
-- below as supabase_admin (or transfer ownership to postgres). Until
-- then this file is documentation + future fix, not a runnable script.
--
-- Verification after the fix (anon key, via REST):
--   GET  /rest/v1/spatial_ref_sys?srid=eq.4326&select=srid  → 200, 1 row
--   POST /rest/v1/spatial_ref_sys (duplicate srid)          → 42501
--     ("new row violates row-level security policy")
--
-- The statements themselves are correct as written below (DROP IF
-- EXISTS + CREATE — Postgres has no CREATE OR REPLACE POLICY).

-- RUNNABLE ONLY AS THE TABLE OWNER (supabase_admin) — see above.
ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spatial_ref_sys_public_read ON public.spatial_ref_sys;
CREATE POLICY spatial_ref_sys_public_read ON public.spatial_ref_sys
    FOR SELECT TO PUBLIC USING (true);

-- Belt and braces: RLS is IN ADDITION TO table grants, not a replacement.
-- The read policy alone won't save PostGIS functions invoked by the anon
-- role (e.g. ST_Transform) if the grant is ever missing.
GRANT SELECT ON public.spatial_ref_sys TO anon, authenticated;
