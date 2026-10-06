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
--   * substring  — space-normalized unaccented ILIKE on both sides, so
--                  "mountain empire" AND "mountainempire" both match
--                  "Mountain Empire Recovery ..." (branch is not
--                  index-backed through the view; by design)
--   * fuzzy      — word_similarity > 0.45 (misspellings, pg_trgm)
--   * synonyms   — exact synonym term → its category or topic
-- Filters:
--   * topic  — plain-language topic slug through topic_categories
--   * county — county name through service_areas ONLY. Deliberate:
--              the trial/production import (import_trial.py, the
--              organisation_locations loop) writes a service_areas row
--              for every location's home county, so pinned listings
--              are never dropped; service_areas remains the single
--              authoritative "who serves where" relation
--              (03_plain_english.md §03) and a missing coverage row
--              surfaces as a visible gap rather than being silently
--              compensated for.
-- Ordering: relevance when q is non-empty —
--     3.0 * word_similarity(name)     (people search by name)
--   + 8.0 * ts_rank(search_tsv, q)    (text relevance)
--   + 0.5 * exact-substring bonus
--   with name, id as the deterministic tiebreak. When q is empty the
--   rank is uniformly 0, so browse/filter views stay alphabetical.
--   Synonym-only matches also rank ~0 and fall back to name order —
--   ranking a large synonym-expanded set by incidental text is noise.
-- RLS: invoker rights — runs as the calling role (anon), so only
-- published organisations can ever be returned. The 1:1 join onto
-- organisations (same id, same publication filter as the view) adds
-- no rows and leaks nothing.
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
            -- escape LIKE wildcards, then strip spaces: the name side of
            -- the ILIKE is space-stripped too, so both forms match
            '%' || replace(replace(replace(replace(
                       raw_q, '\', '\\'),
                       '%', '\%'),
                       '_', '\_'),
                       ' ', '') || '%' AS tight_pattern,
            websearch_to_tsquery(
                'english', public.immutable_unaccent(raw_q)) AS fts_q
        FROM input
    )
    SELECT pr.*
    FROM public.published_resources pr
    JOIN public.organisations o ON o.id = pr.id
    CROSS JOIN needle n
    WHERE (
            n.raw_q = ''
        OR  pr.id IN (
                SELECT og.id
                FROM public.organisations og
                WHERE og.status = 'published'
                  AND (
                        og.search_tsv @@ n.fts_q
                    OR  replace(public.immutable_unaccent(coalesce(og.name, '')),
                                ' ', '') ILIKE n.tight_pattern
                    OR  public.word_similarity(
                            public.immutable_unaccent(n.raw_q),
                            public.immutable_unaccent(coalesce(og.name, ''))) > 0.45
                    OR  EXISTS (
                            SELECT 1
                            FROM public.search_synonyms ss
                            WHERE lower(ss.term) = lower(n.raw_q)
                              AND (
                                    (ss.category_id IS NOT NULL AND ss.category_id IN (
                                        SELECT oc.category_id
                                        FROM public.organisation_categories oc
                                        WHERE oc.organisation_id = og.id))
                                 OR (ss.topic_id IS NOT NULL AND EXISTS (
                                        SELECT 1
                                        FROM public.organisation_categories oc2
                                        JOIN public.topic_categories tc
                                          ON tc.category_id = oc2.category_id
                                        WHERE oc2.organisation_id = og.id
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
    ORDER BY
        CASE
            WHEN n.raw_q = '' THEN 0
            ELSE (
                  3.0 * public.word_similarity(
                            public.immutable_unaccent(n.raw_q),
                            public.immutable_unaccent(coalesce(o.name, '')))
                + 8.0 * ts_rank(o.search_tsv, n.fts_q)
                + CASE WHEN replace(public.immutable_unaccent(coalesce(o.name, '')),
                                    ' ', '') ILIKE n.tight_pattern
                       THEN 0.5 ELSE 0 END
            )
        END DESC,
        pr.name,
        pr.id;
$$;

REVOKE ALL ON FUNCTION public.search_resources(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_resources(text, text, text) TO anon, authenticated;
