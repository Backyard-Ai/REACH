-- Post-deploy hardening for the PostGIS extension's CRS catalog.
--
-- spatial_ref_sys is created by the postgis EXTENSION (not by frozen
-- schema v1.3.1): ~8k rows of public-domain EPSG coordinate reference
-- system definitions. No project data — but on Supabase, a public
-- table without RLS is writable by anyone holding the anon key, and a
-- corrupted CRS catalog breaks PostGIS geometry functions.
--
-- RLS alone (the advisor's one-click fix) would hide the table from the
-- anon role and can break PostGIS lookups such as ST_Transform in
-- anon-executed queries — hence the explicit public read policy.
--
-- Run after schema v1.3.1 in the Supabase SQL Editor (or via
-- scripts/run-sql.mjs). Idempotent: OR REPLACE on the policy.

ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE POLICY spatial_ref_sys_public_read ON public.spatial_ref_sys
    FOR SELECT TO PUBLIC USING (true);
