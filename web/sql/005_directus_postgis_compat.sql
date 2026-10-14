-- =====================================================================
-- PostGIS relocation compatibility views for Directus (and anything
-- else that expects the PostGIS catalogs in public).
--
-- Background: Supabase relocated the postgis extension to the
-- non-exposed `extensions` schema (2026-10-12, see 003). Directus's
-- schema introspection queries geometry_columns / geography_columns
-- UNQUALIFIED, so on connections whose search_path lacks `extensions`
-- the names don't resolve and introspection fails, leaving Directus
-- with an empty data model.
--
-- These views restore the names in public, rewriting f_table_schema
-- to 'public' so Directus's `WHERE f_table_schema in ('public')`
-- filter still matches. They change no data and expose nothing that
-- wasn't public reference metadata already.
--
-- Applied 2026-10-12; this file makes the change reproducible for the
-- next environment. Run as postgres in the SQL Editor. Idempotent.
-- =====================================================================

CREATE OR REPLACE VIEW public.geometry_columns AS
SELECT f_table_catalog, 'public'::name AS f_table_schema, f_table_name,
       f_geometry_column, coord_dimension, srid, type
  FROM extensions.geometry_columns
 WHERE f_table_schema = 'public';

CREATE OR REPLACE VIEW public.geography_columns AS
SELECT f_table_catalog, 'public'::name AS f_table_schema, f_table_name,
       f_geography_column, coord_dimension, srid, type
  FROM extensions.geography_columns
 WHERE f_table_schema = 'public';

GRANT SELECT ON public.geometry_columns, public.geography_columns
  TO directus, anon, authenticated;
