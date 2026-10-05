-- =====================================================================
-- REACH web app — search RPC (app addition, NOT part of frozen schema
-- v1.3.1; no table, column or view is created or altered here).
--
-- Why this exists: the public read contract is the published_resources
-- view, but PostgREST cannot drive the trigram / full-text indexes on
-- organisations through that view, so misspelled-name search would be
-- impossible. This function runs entirely inside Postgres, uses those
-- existing indexes, honours the synonym table, and RETURNS rows of the
-- same view — the read contract is unchanged.
--
-- Run once in the Supabase SQL Editor after schema v1.3.1.
--
-- Matches (when q is non-empty):
--   * full text  — search_tsv @@ websearch_to_tsquery (name A, category
--                  labels B, description C, additional info D weights)
--   * substring  — unaccented name ILIKE %q% (partial names)
--   * fuzzy      — word_similarity > 0.45 (misspellings, pg_trgm)
--   * synonyms   — exact synonym term → its category or topic
-- Filters:
--   * topic  — plain-language topic slug through topic_categories
--   * county — county name through service_areas (coverage counts)
-- RLS: invoker rights — runs as the calling role (anon), so only
-- published organisations can ever be returned.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.search_resources(
    q      text DEFAULT '',
    topic  text DEFAULT NULL,
    county text DEFAULT NULL
)
RETURNS SETOF public.published_resources
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    WITH input AS (
        SELECT trim(coalesce(q, '')) AS raw_q
    ),
    needle AS (
        SELECT
            raw_q,
            '%' || replace(replace(replace(replace(
                       raw_q, '\', '\\'),
                       '%', '\%'),
                       '_', '\_'),
                       ' ', '') || '%' AS tight_pattern
        FROM input
    )
    SELECT pr.*
    FROM public.published_resources pr
    CROSS JOIN needle n
    WHERE (
            n.raw_q = ''
        OR  pr.id IN (
                SELECT o.id
                FROM public.organisations o
                WHERE o.status = 'published'
                  AND (
                        o.search_tsv @@ websearch_to_tsquery(
                            'english', public.immutable_unaccent(n.raw_q))
                    OR  public.immutable_unaccent(coalesce(o.name, ''))
                            ILIKE n.tight_pattern
                    OR  word_similarity(
                            public.immutable_unaccent(n.raw_q),
                            public.immutable_unaccent(coalesce(o.name, ''))) > 0.45
                    OR  EXISTS (
                            SELECT 1
                            FROM public.search_synonyms ss
                            WHERE lower(ss.term) = lower(n.raw_q)
                              AND (
                                    (ss.category_id IS NOT NULL AND ss.category_id IN (
                                        SELECT oc.category_id
                                        FROM public.organisation_categories oc
                                        WHERE oc.organisation_id = o.id))
                                 OR (ss.topic_id IS NOT NULL AND EXISTS (
                                        SELECT 1
                                        FROM public.organisation_categories oc2
                                        JOIN public.topic_categories tc
                                          ON tc.category_id = oc2.category_id
                                        WHERE oc2.organisation_id = o.id
                                          AND tc.topic_id = ss.topic_id))
                                  )
                        )
                  )
            )
    )
    AND (
            topic IS NULL OR trim(topic) = ''
        OR  EXISTS (
                SELECT 1
                FROM public.organisation_categories oc
                JOIN public.topic_categories tc
                  ON tc.category_id = oc.category_id
                JOIN public.plain_language_topics t
                  ON t.id = tc.topic_id
                 AND t.is_active
                WHERE oc.organisation_id = pr.id
                  AND t.slug = topic
            )
    )
    AND (
            county IS NULL OR trim(county) = ''
        OR  EXISTS (
                SELECT 1
                FROM public.service_areas sa
                JOIN public.counties f ON f.fips = sa.county_fips
                WHERE sa.organisation_id = pr.id
                  AND f.name = county
            )
    )
    ORDER BY pr.name;
$$;

REVOKE ALL ON FUNCTION public.search_resources(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_resources(text, text, text) TO anon, authenticated;
