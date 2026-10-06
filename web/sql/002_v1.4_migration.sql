-- =====================================================================
-- REACH — v1.4 migration (app addition; frozen schema v1.3.1 untouched)
--
-- Maps to Nick's schema review (October 2026):
--   block (a) point 3  — optional parent-organisation link on
--                        organisations (groups the five Frontier Health
--                        programmes; empty at import, filled via Directus;
--                        aligns with Open Referral HSDS
--                        parent_organization_id).
--   block (c) point 3  — expose parent_id in the published_resources
--                        feed by appending it AT THE END of the view
--                        (PG only allows appended columns via
--                        CREATE OR REPLACE VIEW; the view is NOT dropped,
--                        so search_resources — which declares RETURNS
--                        SETOF published_resources — keeps working
--                        untouched).
--   block (b) point 2  — remove the anonymous INSERT policy on
--                        submissions: public submissions move to the
--                        server-side route (src/app/api/submissions)
--                        with Turnstile + rate limiting + a service-role
--                        insert. The existing review-field CHECKs are
--                        untouched.
--
-- DEPLOYMENT ORDER: deploy the app (route live, inserts via service
-- role — works with or without the old policy) BEFORE running this
-- file. Dropping the policy first would break the correction form.
--
-- Idempotent: IF NOT EXISTS / IF EXISTS / OR REPLACE throughout; the
-- CHECK constraint goes through a guard DO block because PostgreSQL
-- has no ADD CONSTRAINT IF NOT EXISTS. Safe to re-run.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- (a) Parent organisation — Nick point 3
-- ---------------------------------------------------------------------
ALTER TABLE public.organisations
    ADD COLUMN IF NOT EXISTS parent_id bigint
        REFERENCES public.organisations(id) ON DELETE SET NULL;

-- Cycles (A→B→A) cannot be constrained by CHECK; admin discipline in
-- Directus for now — a later migration can add a trigger if it bites.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'organisations_parent_not_self'
           AND conrelid = 'public.organisations'::regclass
    ) THEN
        EXECUTE 'ALTER TABLE public.organisations
                 ADD CONSTRAINT organisations_parent_not_self
                 CHECK (parent_id IS NULL OR parent_id <> id)';
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS organisations_parent_idx
    ON public.organisations (parent_id);

-- ---------------------------------------------------------------------
-- (c) published_resources gains parent_id as its final column.
--     The body below is byte-for-byte the v1.3.1 definition with one
--     addition: ", o.parent_id" after the hours subselect. Grouping is
--     unchanged (GROUP BY o.id already covers functionally-dependent
--     columns). security_invoker is re-specified so the replace cannot
--     silently drop it. OR REPLACE preserves existing grants; the
--     guarded re-grant below asserts them anyway (belt and braces).
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.published_resources
WITH (security_invoker = true) AS
SELECT
    o.id,
    o.region_id,
    o.slug,
    o.name,
    o.kind,
    o.description,
    o.website,
    o.public_phone,
    o.public_email,
    o.last_verified_on,
    COALESCE(array_agg(DISTINCT c.name) FILTER (WHERE c.id IS NOT NULL),
             '{}'::text[])                                     AS categories,
    COALESCE((SELECT jsonb_object_agg(k.kind, k.labels)
                FROM (SELECT a.kind,
                             array_agg(a.label ORDER BY a.sort_order, a.label) AS labels
                        FROM organisation_attributes oa
                        JOIN attributes a ON a.id = oa.attribute_id AND a.is_active
                       WHERE oa.organisation_id = o.id
                       GROUP BY a.kind) k),
             '{}'::jsonb)                                      AS attributes,
    COALESCE((SELECT array_agg(DISTINCT f.name ORDER BY f.name)
                FROM service_areas sa
                JOIN counties f ON f.fips = sa.county_fips
               WHERE sa.organisation_id = o.id),
             '{}'::text[])                                     AS counties_served,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'county', f.name, 'fips', f.fips,
                   'phone', sa.public_phone)
                 ORDER BY f.name)
                FROM service_areas sa
                JOIN counties f ON f.fips = sa.county_fips
               WHERE sa.organisation_id = o.id),
             '[]'::jsonb)                                      AS county_coverage,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'location_id', l.id,
                   'address', l.address_line1,
                   'city', l.city,
                   'state', l.state_code,
                   'postal_code', l.postal_code,
                   'lat', CASE WHEN l.geog IS NULL THEN NULL
                               ELSE ST_Y(l.geog::geometry) END,
                   'lng', CASE WHEN l.geog IS NULL THEN NULL
                               ELSE ST_X(l.geog::geometry) END)
                 ORDER BY l.city, l.address_line1)
                FROM organisation_locations ol
                JOIN locations l ON l.id = ol.location_id
               WHERE ol.organisation_id = o.id),
             '[]'::jsonb)                                      AS locations,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'day', h.day_of_week,
                   'opens', h.opens,
                   'closes', h.closes,
                   'note', h.note,
                   'verified_on', h.verified_on,
                   'location_id', h.location_id)
                 ORDER BY h.day_of_week, h.opens)
                FROM organisation_hours h
               WHERE h.organisation_id = o.id),
             '[]'::jsonb)                                      AS hours,
    o.parent_id
FROM organisations o
LEFT JOIN organisation_categories oc ON oc.organisation_id = o.id
LEFT JOIN categories c ON c.id = oc.category_id AND c.is_active
WHERE o.status = 'published'
GROUP BY o.id;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'GRANT SELECT ON public.published_resources, public.published_meetings TO anon, authenticated';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- (b) Anonymous direct INSERT on submissions is replaced by the
--     server-side route (Turnstile + rate limit + service-role insert,
--     trustworthy source_ip_hash). Kept LAST so a partial/manual run
--     order can't strand the site without a write path.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS submission_public_insert ON public.submissions;

COMMIT;
