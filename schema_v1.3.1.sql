-- =====================================================================
-- Northeast Tennessee Reach — Resource Directory
-- Database schema (Phase 0 deliverable)
--
-- Target:  PostgreSQL 15+ with PostGIS 3 (Supabase default)
-- Author:  Silvia Barros / Bandida Tech Pte. Ltd.
-- Version: 1.3.1  (2026-10-04)  — supersedes v1.3 (2026-10-04)
--
-- v1.3.1 is one hardening change: search_path is pinned on all four
-- functions (and their bodies schema-qualified), so Supabase's security
-- advisor passes with zero warnings — no function_search_path_mutable
-- findings at deployment or at the pre-handoff re-run.
--
-- Nothing is deployed yet, so this file regenerates the schema
-- wholesale rather than migrating it. v1.1 carried the October client
-- review (RLS on every table, organisations.kind, organisation_hours,
-- extended attribute_kind, crisis_lines, fully-private contacts with
-- service_areas.public_phone, practitioner_notes, source_records,
-- timestamps everywhere, the search weight-B fix, published views and
-- the Directus grants guard). v1.2 folds in the second review round:
--
--   schedules  a series may now meet 1st & 3rd Tue 7pm AND 2nd & 4th
--              Tue 7pm: weeks_of_month joins the uniqueness key
--              (NULLS NOT DISTINCT, so weekly rows still dedupe).
--   review     organisations gains needs_review / review_note — the
--              flag the import section promised but only contacts had.
--              UIDs that vanish from a new file land here.
--   attributes attribute_kind gains 'eligibility': "populations served
--              and eligibility" is a promised submission-form field.
--   synonyms   the 4-column UNIQUE treated NULLs as distinct and let
--              duplicate terms in; replaced by two partial unique
--              indexes on lower(term), one per target kind.
--   search     category-label triggers now honour categories.is_active
--              (both the filter and UPDATE OF name, is_active — either
--              one alone leaves a stale-label path).
--   submissions reviewer fields must be empty while pending; an anon
--              INSERT could previously arrive pre-reviewed.
--   import     import_runs — one row per monthly refresh, with file
--              hash and added/updated/unchanged/vanished counts — plus
--              content_hash on source_records, so the per-run changes
--              report the client asked for is a query, not a
--              reconstruction from timestamp windows.
--   views      published_meetings gains region_id (parity with
--              published_resources); the hours JSON carries
--              verified_on for the export and Power BI.
--   counts     the July file holds 137 mutual-aid rows, not 134
--              (verified against the tick-box column and the
--              categorization text, which agree exactly).
--
-- v1.3 folds in the third review round:
--
--   views      published_resources gains an attributes object keyed by
--              kind (payment, eligibility, language…): the professional
--              export without them is half a referral, and the view is
--              the contract all three consumers build against.
--   stories    the Stories page (Phase 1) gets its table now rather
--              than as a mid-build migration. Consent rules are CHECK
--              constraints, not editorial memory: no photo and no
--              pinned location without consent_on_file, and the public
--              read policy requires published AND consented.
--   search     the unaccent extension is wired up (immutable wrapper
--              feeding the generated tsvector and the name trigram
--              indexes). Cheap now; changing a generated column's
--              expression on live data later is not.
--   rls        the four intentionally policy-less tables (contacts,
--              practitioner_notes, source_records, import_runs) get
--              explicit USING (false) read policies — Postgres has no
--              DENY, this is the idiom — so Supabase's security advisor
--              passes with zero warnings and the intent is SQL, not a
--              comment.
--   counts     meeting-sitting and contact-embedding figures in the
--              comments are replaced with numbers re-verified against
--              the July file (163 day/time mentions across 134
--              listings; 110 phone cells), and the ACTION spelling
--              matches the data ("ACTION Recovery Resource Center
--              (AARRC)", no periods).
--
-- Design notes in plain English: 03_plain_english.md — regenerated to
-- match this file (October 2026): 137 mutual-aid rows, Lifeline's ten
-- county rows, Hancock 7 pinned + 4 coverage-only, suboxone 8 listings
-- resolving to 62 treatment services, and no total sitting count (an
-- import output, not a source count).
-- In short:
--   * An ORGANISATION is the thing being listed.
--   * A LOCATION is an optional physical point. Coverage is separate,
--     so a statewide programme with no address is not a special case.
--   * A MEETING is an event series held at a location, with its own
--     recurring schedule — not an organisation and not a location.
--   * Taxonomy, plain-language labels and synonyms are DATA, not code.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;      -- geography type + spatial index
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- fuzzy / misspelling tolerance
CREATE EXTENSION IF NOT EXISTS unaccent;     -- diacritic-insensitive search
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive email

-- unaccent() is STABLE, not IMMUTABLE, so it cannot be used in a
-- generated column or an index expression as-is. This wrapper is the
-- standard idiom: marked IMMUTABLE, it feeds the search tsvector and
-- the name trigram indexes so "Espanol" finds "Español".
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
SET search_path = '' AS $$
    SELECT public.unaccent('public.unaccent', $1)
$$;

-- ---------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------
CREATE TYPE publication_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE submission_kind    AS ENUM ('new_listing', 'update_listing', 'correction');
CREATE TYPE submission_status  AS ENUM ('pending', 'approved', 'rejected', 'superseded');
CREATE TYPE weekday            AS ENUM ('sunday','monday','tuesday','wednesday',
                                        'thursday','friday','saturday');
-- Extended now (rather than by migration later) with the kinds the
-- submission form asks for. Meeting FORMAT stays on meeting_types,
-- which has its own vocabulary.
CREATE TYPE attribute_kind     AS ENUM ('access', 'population', 'payment',
                                        'service_type', 'language', 'level_of_care',
                                        'eligibility');
-- Every AA/NA group in the source became an organisation (a meeting
-- series needs one); this is how the services list tells them apart
-- from organisations that are services.
CREATE TYPE org_kind           AS ENUM ('service', 'meeting_group');
-- How precisely a story's location may be shown, per the contributor's
-- consent choice (brand guide: written consent; county-level rather
-- than pinned is offered).
CREATE TYPE story_location_granularity AS ENUM ('none', 'county', 'point');

-- =====================================================================
-- 1. TENANCY
--    Every content table carries region_id. Nothing uses it on day one:
--    the site serves exactly one region. It exists so that a second
--    agency — or a shared multi-region platform — is an extension
--    rather than a migration touching every table and every query.
-- =====================================================================
CREATE TABLE regions (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug          text        NOT NULL UNIQUE,
    name          text        NOT NULL,
    -- Per-region branding and page copy live here as config, so a
    -- second deployment is data rather than a code fork. Crisis
    -- numbers do NOT live here any more: they need a verified date
    -- each, so they are rows in crisis_lines (section 3e).
    settings      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT regions_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON TABLE  regions IS 'Tenant boundary. One row today (netn-reach).';
COMMENT ON COLUMN regions.settings IS
    'Branding tokens and page copy — configuration, not code.';

-- =====================================================================
-- 2. GEOGRAPHY
--    Counties are keyed by 5-digit FIPS, not by name, because the data
--    contains Bristol VA in "Washington" county — Washington County VA
--    (51191) is a different place from Washington County TN (47179),
--    and Bristol straddles the state line. Name-keying would silently
--    file it under the wrong county.
--    Bristol VA is an INDEPENDENT CITY: its Census county-equivalent
--    is 51520 ("Bristol city"), which is how the import files it —
--    out-of-region, flagged for review, never silently reassigned to
--    either Washington County.
--    The table is not limited to the ten NETN counties: recovery courts
--    in the source data serve Grainger, Jefferson and Sevier as well.
-- =====================================================================
CREATE TABLE counties (
    fips          char(5)     PRIMARY KEY,           -- e.g. '47179'
    name          text        NOT NULL,              -- 'Washington'
    state_code    char(2)     NOT NULL,              -- 'TN'
    -- True for the ten counties this directory is *about*. Others may be
    -- referenced as service areas without being browsable.
    in_region     boolean     NOT NULL DEFAULT false,
    region_id     bigint      REFERENCES regions(id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name, state_code)
);

CREATE INDEX counties_in_region_idx ON counties (region_id) WHERE in_region;

-- =====================================================================
-- 3. TAXONOMY  (all editable in Directus; nothing hard-coded)
-- =====================================================================

-- 3a. The professional taxonomy — the 13 recovery-asset categories.
CREATE TABLE categories (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id       bigint      NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    slug            text        NOT NULL,
    name            text        NOT NULL,
    -- Legacy UID prefix from the master spreadsheet (AO, CRP, RR, TS…),
    -- kept so existing references and printed materials still resolve.
    legacy_prefix   text,
    definition      text,
    definition_source text,
    source_urls     text[]      NOT NULL DEFAULT '{}',
    sort_order      smallint    NOT NULL DEFAULT 100,
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (region_id, slug)
);

COMMENT ON COLUMN categories.definition IS
    'From 02_Category_Definitions.md. Marked draft — ETSU to approve before launch.';

-- 3b. The plain-language layer shown to the public.
--     "Recovery Informed Institutional Service" means little at 2am;
--     "A place to stay" does. Many-to-many onto categories.
CREATE TABLE plain_language_topics (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id     bigint   NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    slug          text     NOT NULL,
    label         text     NOT NULL,                 -- 'A place to stay'
    description   text,
    icon          text,
    sort_order    smallint NOT NULL DEFAULT 100,
    is_active     boolean  NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (region_id, slug)
);

CREATE TABLE topic_categories (
    topic_id      bigint NOT NULL REFERENCES plain_language_topics(id) ON DELETE CASCADE,
    category_id   bigint NOT NULL REFERENCES categories(id)            ON DELETE CASCADE,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (topic_id, category_id)
);

-- 3c. Synonyms. Stemming handles house/housing and trigrams handle
--     "recovry"; neither can know that "Suboxone" means Treatment
--     Services. That mapping has to be supplied, so it lives here where
--     a non-developer can add a row.
CREATE TABLE search_synonyms (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id     bigint NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    term          text   NOT NULL,                   -- 'suboxone', 'sober living'
    category_id   bigint REFERENCES categories(id)            ON DELETE CASCADE,
    topic_id      bigint REFERENCES plain_language_topics(id) ON DELETE CASCADE,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    -- A synonym must point at something, and at exactly one kind of thing.
    CONSTRAINT synonym_targets_one_thing
        CHECK (num_nonnulls(category_id, topic_id) = 1)
);

-- Uniqueness is enforced by two partial indexes rather than a 4-column
-- UNIQUE: that form treats NULLs as distinct, so ('suboxone' → category
-- 5, topic NULL) could be inserted twice. One index per target kind,
-- keyed on lower(term) so 'Suboxone' and 'suboxone' cannot both exist.
CREATE UNIQUE INDEX search_synonyms_category_unique_idx
    ON search_synonyms (region_id, lower(term), category_id)
    WHERE category_id IS NOT NULL;

CREATE UNIQUE INDEX search_synonyms_topic_unique_idx
    ON search_synonyms (region_id, lower(term), topic_id)
    WHERE topic_id IS NOT NULL;

CREATE INDEX search_synonyms_term_trgm_idx
    ON search_synonyms USING gin (term gin_trgm_ops);

-- 3d. Small controlled vocabularies used by filters — the fields the
--     submission form asks for that the spreadsheet has no column for.
--     One table rather than several, so Directus shows one editable
--     list. `kind` is an enum rather than its own lookup table: it is a
--     closed set the application understands by name, so a table would
--     add a join and a Directus collection for no editing benefit.
CREATE TABLE attributes (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id     bigint   NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    kind          attribute_kind NOT NULL,
    slug          text     NOT NULL,
    label         text     NOT NULL,
    sort_order    smallint NOT NULL DEFAULT 100,
    is_active     boolean  NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (region_id, kind, slug)
);

CREATE INDEX attributes_kind_idx ON attributes (region_id, kind, sort_order);

-- 3e. Crisis lines. The Get Help Now page's numbers, each with the
--     verified date the proposal promises ("verified at build and
--     again before launch"). A table rather than JSON in
--     regions.settings because each line needs its own verified_on
--     and display order, and a line can be retired without editing a
--     blob. The 911 tap-through wording lives in `description`.
CREATE TABLE crisis_lines (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id   bigint NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    slug        text   NOT NULL,
    label       text   NOT NULL,          -- 'TN REDLINE'
    phone       text   NOT NULL,
    description text,                     -- 'statewide, confidential'
    url         text,
    is_24_7     boolean NOT NULL DEFAULT true,
    sort_order  smallint NOT NULL DEFAULT 100,
    verified_on date,                     -- re-verified before launch
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (region_id, slug)
);

CREATE INDEX crisis_lines_active_idx ON crisis_lines (region_id, sort_order)
    WHERE is_active;

-- =====================================================================
-- 4. ORGANISATIONS
--    One row per organisation. In the source spreadsheet the UID is per
--    category-row, so ACTION Recovery Resource Center (AARRC) appears
--    twice (PRS10 and RCO1) with every other field identical. Those
--    collapse to one row here, with both UIDs retained as aliases.
-- =====================================================================
CREATE TABLE organisations (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id         bigint  NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    slug              text    NOT NULL,              -- public URL
    name              text    NOT NULL,
    -- 'service' or 'meeting_group'. Every AA/NA group in the source
    -- became an organisation (a meeting series needs one), so the
    -- services directory filters kind='service' to keep the 137 groups
    -- out of it, while the meetings path doesn't care.
    kind              org_kind NOT NULL DEFAULT 'service',
    description       text,
    -- Free text from the source that is neither schedule nor coverage.
    additional_info   text,
    website           text,
    public_phone      text,
    public_email      citext,

    status            publication_status NOT NULL DEFAULT 'draft',
    -- Shown on every listing. Stale data in a recovery directory means
    -- someone arrives at a closed facility on their worst day.
    last_verified_on  date,

    -- Set by the monthly import when a UID vanishes from the new file
    -- (section 7): never deleted, never quietly left published — flagged
    -- for a human. Also usable by editors for anything that smells off.
    needs_review      boolean NOT NULL DEFAULT false,
    review_note       text,

    -- Original spreadsheet UIDs (may be several after a merge).
    legacy_uids       text[]  NOT NULL DEFAULT '{}',

    -- Denormalized category names, maintained by trigger (section 11),
    -- so the search document below can weight them. v1.0's comment
    -- promised weight B and the column never delivered it.
    category_labels   text    NOT NULL DEFAULT '',

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    -- Weights: A = name, B = category labels, C = description,
    -- D = additional info. All text runs through immutable_unaccent so
    -- diacritic-free typing still matches.
    search_tsv        tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', immutable_unaccent(coalesce(name, ''))),            'A') ||
        setweight(to_tsvector('english', immutable_unaccent(category_labels)),               'B') ||
        setweight(to_tsvector('english', immutable_unaccent(coalesce(description, ''))),    'C') ||
        setweight(to_tsvector('english', immutable_unaccent(coalesce(additional_info, ''))), 'D')
    ) STORED,

    UNIQUE (region_id, slug),
    CONSTRAINT organisations_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT organisations_website_scheme
        CHECK (website IS NULL OR website ~* '^https?://')
);

CREATE INDEX organisations_status_idx  ON organisations (region_id, status);
-- The services directory list query, pre-filtered.
CREATE INDEX organisations_services_idx
    ON organisations (region_id, status) WHERE kind = 'service';
-- The review queue for vanished UIDs and editor flags.
CREATE INDEX organisations_needs_review_idx
    ON organisations (region_id) WHERE needs_review;
CREATE INDEX organisations_legacy_idx  ON organisations USING gin (legacy_uids);
CREATE INDEX organisations_name_trgm_idx
    ON organisations USING gin ((immutable_unaccent(name)) gin_trgm_ops);
CREATE INDEX organisations_search_idx ON organisations USING gin (search_tsv);

-- Organisation ↔ category (many-to-many; max 2 in today's data).
CREATE TABLE organisation_categories (
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    category_id     bigint NOT NULL REFERENCES categories(id)    ON DELETE RESTRICT,
    is_primary      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, category_id)
);

-- At most one primary category per organisation.
CREATE UNIQUE INDEX organisation_categories_one_primary_idx
    ON organisation_categories (organisation_id) WHERE is_primary;

CREATE INDEX organisation_categories_category_idx
    ON organisation_categories (category_id);

CREATE TABLE organisation_attributes (
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    attribute_id    bigint NOT NULL REFERENCES attributes(id)    ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, attribute_id)
);

-- ---------------------------------------------------------------------
-- 4a. Contacts
--     In the spreadsheet a staff name is embedded in the phone cell
--     ("Ashley Street\n(423) 518-1257") — 110 phone cells and 25 email
--     cells are like this, and 15 cells hold more than one person.
--     Contacts are their own table and PRIVATE, full stop: the only
--     SELECT policy is an explicit USING (false), so the anonymous
--     role cannot read this table at all. The brand guide asks that
--     identifiable individuals not be paired with service claims, and
--     a phone that must be dialable without exposing who answers it is
--     published where it is displayed: organisations.public_phone for
--     the org-level number, service_areas.public_phone for a county
--     specialist's line ("Carter County: (423) 555-0123" — reachable,
--     unattributed).
--     This replaces v1.0's is_public flag, which covered name and
--     number together: RLS is row-level, so a row readable for its
--     number would have exposed its name too.
-- ---------------------------------------------------------------------
CREATE TABLE contacts (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name            text,
    role            text,
    phone           text,
    email           citext,
    -- Set where the source data disagrees with itself and a human must
    -- decide (e.g. one ROPS row reads …6113 where seven read …6117).
    needs_review    boolean NOT NULL DEFAULT false,
    review_note     text,
    sort_order      smallint NOT NULL DEFAULT 100,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contacts_organisation_idx ON contacts (organisation_id);
CREATE INDEX contacts_needs_review_idx ON contacts (organisation_id) WHERE needs_review;

-- ---------------------------------------------------------------------
-- 4b. Practitioner notes — professional-facing context that must never
--     reach the public site. A separate TABLE, not a column on
--     organisations: an RLS SELECT policy returns whole rows, so a
--     column would ride along with every public read. The only policy
--     here is an explicit USING (false), which makes the table
--     invisible — not merely unlisted — to the anonymous role.
-- ---------------------------------------------------------------------
CREATE TABLE practitioner_notes (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    note            text NOT NULL,
    created_by      text,                 -- Directus user
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX practitioner_notes_org_idx ON practitioner_notes (organisation_id);

-- ---------------------------------------------------------------------
-- 4c. Stories — the Stories page and story map (Phase 1). Added now
--     rather than as a mid-build migration because the consent model
--     is already specified: the brand guide requires written consent
--     for photographs and identifiable details, and contributors choose
--     first-name-only, no photo, or county-level rather than pinned
--     location. Those rules are CHECK constraints and an RLS policy —
--     enforced by the database, not remembered by editors.
-- ---------------------------------------------------------------------
CREATE TABLE stories (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id          bigint NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    slug               text   NOT NULL,
    title              text   NOT NULL,
    body               text   NOT NULL,
    -- What the byline shows: first name only, a pseudonym, or NULL for
    -- "a REACH participant".
    display_name       text,
    photo_url          text,
    -- The written consent the brand guide requires. Gates everything
    -- identifying; the public read policy (section 10) requires it.
    consent_on_file    boolean NOT NULL DEFAULT false,
    -- 'none' = no map presence; 'county' = shown at county level;
    -- 'point' = pinned on the story map.
    location_granularity story_location_granularity NOT NULL DEFAULT 'none',
    county_fips        char(5) REFERENCES counties(fips) ON DELETE SET NULL,
    geog               geography(Point, 4326),
    status             publication_status NOT NULL DEFAULT 'draft',
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),

    UNIQUE (region_id, slug),
    CONSTRAINT stories_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    -- Identifying content only with consent on file.
    CONSTRAINT stories_photo_needs_consent
        CHECK (photo_url IS NULL OR consent_on_file),
    CONSTRAINT stories_point_needs_consent
        CHECK (geog IS NULL OR (consent_on_file AND location_granularity = 'point')),
    -- 'county' granularity must name the county; 'point' must carry geog.
    CONSTRAINT stories_county_granularity
        CHECK (location_granularity <> 'county' OR county_fips IS NOT NULL),
    CONSTRAINT stories_point_granularity
        CHECK (location_granularity <> 'point' OR geog IS NOT NULL)
);

CREATE INDEX stories_region_status_idx ON stories (region_id, status);
CREATE INDEX stories_geog_idx          ON stories USING gist (geog);
CREATE INDEX stories_county_idx        ON stories (county_fips);

-- =====================================================================
-- 5. LOCATIONS AND COVERAGE  — deliberately separate concerns
--
--    An organisation has zero or more physical locations AND zero or
--    more counties it serves. Those are independent:
--
--      * a treatment centre  -> 1 location + several service areas
--      * a recovery court    -> 1 location + the counties it covers
--      * ROPS / Lifeline     -> 0 locations + many service areas
--
--    Modelling the address-less records as an exception would have
--    needed a special case in every query. This way they are just rows
--    with no location.
-- =====================================================================
-- A location is a PLACE, not a listing's property. It has no owning
-- organisation column because in the source data places are shared:
-- 41 addresses host more than one distinctly-named organisation —
-- 513 E Unaka Ave, Johnson City has a recovery community centre plus 15
-- mutual-aid meetings; 208 E Unaka Ave has five Frontier Health
-- programmes. Ownership is therefore a relationship
-- (organisation_locations), and geocoding has exactly one row per place.
CREATE TABLE locations (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id       bigint  NOT NULL REFERENCES regions(id)       ON DELETE CASCADE,
    name            text,                            -- venue name, if known
    label           text,                            -- 'Men's house'
    address_line1   text,
    address_line2   text,
    city            text,
    state_code      char(2),
    postal_code     text,
    county_fips     char(5) REFERENCES counties(fips) ON DELETE SET NULL,

    -- WGS84. Populated once at import by the geocoder; NULL until then.
    geog            geography(Point, 4326),
    geocode_source  text,                            -- 'census' | 'geocodio' | 'manual'
    geocode_quality text,                            -- provider match score
    geocoded_at     timestamptz,

    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT locations_postal_format
        CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{5}(-[0-9]{4})?$')
);

CREATE INDEX locations_county_idx       ON locations (county_fips);
-- Spatial index: powers "within 25 miles of me" and distance sorting.
CREATE INDEX locations_geog_idx         ON locations USING gist (geog);

-- One physical address appears once. Keeps shared venues from multiplying
-- and gives geocoding a single row to write per place.
-- Street + city only: the postal code is an attribute of the place, not
-- part of its identity, and the source disagrees with itself on two of
-- them (1425 E Center St, Kingsport is filed as both 37660 and 37664).
-- Including it in the key would split one venue into two.
-- NOTE: this index compares lower(address_line1) verbatim — it will NOT
-- catch "122 C Armed Forces Dr" vs "122C Armed Forces Drive" (the source
-- contains both spellings of that venue). Whitespace, punctuation and
-- street-suffix normalisation is the importer's job, BEFORE insert; no
-- SQL key can enforce it afterwards.
CREATE UNIQUE INDEX locations_unique_address_idx
    ON locations (region_id, lower(coalesce(address_line1, '')),
                  lower(coalesce(city, '')))
    WHERE address_line1 IS NOT NULL;

-- Which organisations operate at which places. An organisation may have
-- several (ReVida Recovery Center is at four cities; Recovery Resources
-- Recovery Living at ten addresses) and a place may host several.
CREATE TABLE organisation_locations (
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    location_id     bigint NOT NULL REFERENCES locations(id)     ON DELETE CASCADE,
    is_primary      boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, location_id)
);

CREATE INDEX organisation_locations_location_idx
    ON organisation_locations (location_id);

CREATE UNIQUE INDEX organisation_locations_one_primary_idx
    ON organisation_locations (organisation_id) WHERE is_primary;

-- Coverage. contact_id answers "who covers this county" — essential for
-- Lifeline Peer Project, where each county has a different named peer
-- specialist and phone. Merging that to one number would hand someone in
-- Hamblen the Carter County worker. The specialist stays private
-- (contacts, 4a); public_phone is what the county-served band shows.
CREATE TABLE service_areas (
    organisation_id bigint  NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    county_fips     char(5) NOT NULL REFERENCES counties(fips)    ON DELETE RESTRICT,
    contact_id      bigint  REFERENCES contacts(id) ON DELETE SET NULL,
    -- The number to publish for this county when the named specialist
    -- must stay private: "Carter County — (423) 555-0123", reachable,
    -- unattributed.
    public_phone    text,
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (organisation_id, county_fips)
);

CREATE INDEX service_areas_county_idx  ON service_areas (county_fips);
CREATE INDEX service_areas_contact_idx ON service_areas (contact_id);

-- ---------------------------------------------------------------------
-- 5a. Hours. Promised on the resource detail page in the proposal;
--     missing from schema v1.0. One row per open span. Overnight spans
--     are split across days (closes 23:00 on one row, reopens 01:00 on
--     the next day's). A genuinely 24/7 crisis option is served from
--     crisis_lines; a 24/7 residence can carry 00:00–23:59:59 rows or
--     a note. Data arrives through the submission form and the
--     professional CSV — empty at import, like the other form fields.
-- ---------------------------------------------------------------------
CREATE TABLE organisation_hours (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    -- NULL = hours apply at every location of the organisation.
    location_id     bigint REFERENCES locations(id) ON DELETE CASCADE,
    day_of_week     weekday  NOT NULL,
    opens           time     NOT NULL,
    closes          time     NOT NULL,
    note            text,
    verified_on     date,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organisation_hours_span_sane CHECK (opens < closes)
);

CREATE INDEX organisation_hours_org_idx   ON organisation_hours (organisation_id);
CREATE INDEX organisation_hours_loc_idx   ON organisation_hours (location_id);

-- =====================================================================
-- 6. MEETINGS
--    137 of 387 source rows (35%) are mutual-aid meetings. A meeting is
--    an event SERIES held at a location — one venue hosts several — and
--    a series can meet at different times on different days
--    ("Tuesdays at 1:30 PM, Thursdays at 8:30 AM, & Saturdays at 4:00 PM"),
--    which is why the schedule is its own table rather than columns.
--    Field names follow the TSML / Meeting Guide format used by AA
--    intergroups, so existing meeting lists can be imported and exported
--    rather than maintained by hand.
-- =====================================================================
CREATE TABLE meeting_types (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id   bigint NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    code        text   NOT NULL,          -- TSML code: 'O','C','X','D','W','M'
    label       text   NOT NULL,          -- 'Open', 'Handicap Accessible'
    -- Source spellings that mean the same thing ('No Smoking'/'No Tobacco',
    -- 'Big Book'/'Big Book Study'). Import normalises through these.
    aliases     text[] NOT NULL DEFAULT '{}',
    kind        text,                     -- 'access' | 'format' | 'population'
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (region_id, code)
);

CREATE INDEX meeting_types_aliases_idx ON meeting_types USING gin (aliases);

CREATE TABLE meeting_series (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id       bigint NOT NULL REFERENCES regions(id)       ON DELETE CASCADE,
    organisation_id bigint NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    -- Nullable: online-only meetings have no physical location.
    location_id     bigint REFERENCES locations(id) ON DELETE SET NULL,
    name            text   NOT NULL,      -- 'Serenity Improvement Group'
    slug            text   NOT NULL,
    fellowship      text,                 -- 'AA','NA','Al-Anon','Celebrate Recovery'
    -- 'Located in Stoney Creek Baptist Church, Fellowship Hall' — the room
    -- within the venue. Present on 108 of the source rows.
    room            text,
    conference_url  text,
    conference_phone text,
    notes           text,
    status          publication_status NOT NULL DEFAULT 'draft',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (region_id, slug),
    CONSTRAINT meeting_series_is_reachable
        CHECK (location_id IS NOT NULL
               OR conference_url IS NOT NULL
               OR conference_phone IS NOT NULL)
);

CREATE INDEX meeting_series_location_idx ON meeting_series (location_id);
CREATE INDEX meeting_series_org_idx      ON meeting_series (organisation_id);
CREATE INDEX meeting_series_name_trgm_idx
    ON meeting_series USING gin ((immutable_unaccent(name)) gin_trgm_ops);

CREATE TABLE meeting_series_types (
    series_id       bigint NOT NULL REFERENCES meeting_series(id) ON DELETE CASCADE,
    meeting_type_id bigint NOT NULL REFERENCES meeting_types(id)  ON DELETE CASCADE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (series_id, meeting_type_id)
);

-- One row per (day, time, week-pattern). A series meeting three times a
-- week has three rows. The July file's 137 mutual-aid rows carry 163
-- parseable day/time mentions across 134 listings (re-verified against
-- the file, October 2026); the importer derives sittings from these —
-- "1st, 3rd, & 5th Thursdays at 7:30 PM" is one mention, three
-- sittings, so the final row count is an import output, not a source
-- count. weeks_of_month is part of the uniqueness key so a series can
-- meet 1st & 3rd Tuesdays at 7pm AND 2nd & 4th Tuesdays at 7pm;
-- NULLS NOT DISTINCT keeps plain weekly rows (weeks_of_month NULL)
-- deduplicating as before.
CREATE TABLE meeting_schedules (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    series_id       bigint   NOT NULL REFERENCES meeting_series(id) ON DELETE CASCADE,
    day_of_week     weekday  NOT NULL,
    start_time      time     NOT NULL,
    duration_minutes smallint NOT NULL DEFAULT 60,
    -- NULL = every week. {1,3,5} = 1st, 3rd and 5th — the source contains
    -- '1st, 3rd, & 5th Thursdays at 7:30 PM'.
    weeks_of_month  smallint[],
    timezone        text     NOT NULL DEFAULT 'America/New_York',
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE NULLS NOT DISTINCT (series_id, day_of_week, start_time, weeks_of_month),
    CONSTRAINT meeting_schedules_duration_sane
        CHECK (duration_minutes BETWEEN 5 AND 600),
    CONSTRAINT meeting_schedules_weeks_valid
        CHECK (weeks_of_month IS NULL
               OR (array_length(weeks_of_month, 1) BETWEEN 1 AND 5
                   AND weeks_of_month <@ ARRAY[1,2,3,4,5]::smallint[]))
);

-- "What's on tonight near me" is the commonest query on a meetings page.
CREATE INDEX meeting_schedules_day_time_idx
    ON meeting_schedules (day_of_week, start_time);

-- =====================================================================
-- 7. SOURCE RECORDS AND IMPORT RUNS  (import bookkeeping)
--    The master spreadsheet returns roughly monthly, same format, no
--    closure markers: rows just disappear. The production import is
--    therefore UID-keyed and re-runnable:
--      * one import_runs row per refresh, recording the file, its hash
--        and the added / updated / unchanged / vanished counts — the
--        changes report the client asked for is a SELECT, not a
--        reconstruction from timestamp windows;
--      * match on (source_system, source_uid) and UPSERT — existing
--        rows are updated, never duplicated. content_hash (a hash of
--        the mapped fields) decides "updated" vs "unchanged" without a
--        field-by-field diff;
--      * stamp last_seen_at / last_seen_run_id on every run;
--      * a UID in the database but ABSENT from the new file is NOT
--        deleted and NOT quietly left published: the organisation is
--        flagged needs_review (section 4) and counted in that run's
--        vanished_count.
--
--    source_system names the FORMAT family ('uidmaster'), not the file:
--    the July and November files must match the same records, so dates
--    belong to the run, not to each row. entity_id is polymorphic on
--    purpose — one import writes organisations, meeting series and
--    locations — so there is no single FK to declare.
-- =====================================================================
CREATE TABLE import_runs (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id       bigint      NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    source_system   text        NOT NULL,   -- 'uidmaster'
    source_file     text,                   -- original filename, as received
    file_hash       text,                   -- sha256 of the file as received
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    -- Filled when the run completes. NULL counts = run still in flight
    -- (or failed); the report only reads finished runs.
    added_count     integer,
    updated_count   integer,
    unchanged_count integer,
    vanished_count  integer,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX import_runs_system_idx
    ON import_runs (source_system, started_at DESC);

CREATE TABLE source_records (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_system    text   NOT NULL,   -- 'uidmaster'
    source_uid       text   NOT NULL,   -- 'PRS10'
    entity_table     text   NOT NULL,   -- 'organisations' | 'meeting_series' | …
    entity_id        bigint NOT NULL,
    -- sha256 over the fields this record maps to. A new file whose rows
    -- hash identically is all "unchanged"; a changed hash is "updated".
    content_hash     text,
    first_seen_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),
    last_seen_run_id bigint REFERENCES import_runs(id) ON DELETE SET NULL,
    UNIQUE (source_system, source_uid)
);

CREATE INDEX source_records_entity_idx ON source_records (entity_table, entity_id);
-- Vanished-UID query: rows of this source not stamped by the latest run.
CREATE INDEX source_records_seen_idx
    ON source_records (source_system, last_seen_run_id);

-- =====================================================================
-- 8. PUBLIC SUBMISSIONS  (the review queue)
--    Submissions come from organisations with no account, so this cannot
--    be ordinary row-level editing: a submission is a *proposal* held
--    apart from live data until a human approves it. Directus gives the
--    editing UI and revision history; this table gives the queue.
--
--    ONE table covers all three inbound kinds — a new listing, an update
--    to an existing one, and a "this information is wrong" report from a
--    listing page. They differ only in how much of the payload is filled
--    in, and they all end in the same decision by the same person, so a
--    second table would mean a second review queue to build and watch.
-- =====================================================================
CREATE TABLE submissions (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    region_id           bigint NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    kind                submission_kind   NOT NULL,
    status              submission_status NOT NULL DEFAULT 'pending',

    -- Set for updates/corrections; NULL for a brand-new listing.
    organisation_id     bigint REFERENCES organisations(id) ON DELETE SET NULL,
    -- What the submitter typed, exactly as submitted. Never written
    -- straight into the live tables — the reviewer's diff reads this.
    payload             jsonb  NOT NULL,

    submitter_name      text,
    submitter_email     citext,
    submitter_org_role  text,

    reviewed_by         text,
    reviewed_at         timestamptz,
    review_note         text,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    source_ip_hash      text,     -- hashed, for rate limiting only

    CONSTRAINT submissions_update_names_target
        CHECK (kind = 'new_listing' OR organisation_id IS NOT NULL),
    -- Reviewer fields must be empty while pending (the anonymous INSERT
    -- policy below would otherwise let a submission arrive pre-reviewed)
    -- and a reviewer must be named once decided.
    CONSTRAINT submissions_review_fields_consistent
        CHECK ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
            OR (status <> 'pending' AND reviewed_by IS NOT NULL))
);

CREATE INDEX submissions_queue_idx
    ON submissions (region_id, status, created_at DESC);
CREATE INDEX submissions_organisation_idx ON submissions (organisation_id);

-- "This information is wrong" reports waiting on a listing page. Narrow
-- partial index so the count shown beside a listing stays cheap.
CREATE INDEX submissions_open_corrections_idx
    ON submissions (organisation_id)
    WHERE kind = 'correction' AND status = 'pending';

-- =====================================================================
-- 9. PUBLISHED VIEWS — the single feed
--    One contract for the professional export, the Navigator's nightly
--    data feed and Power BI, so they can never disagree with the site.
--    security_invoker (PG15+): RLS applies to whoever queries the view,
--    so the anonymous role sees exactly what the public site sees, and
--    a read-only BI role sees the same.
-- =====================================================================
CREATE VIEW published_resources
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
    -- Access, populations, payment, eligibility, language, level of
    -- care, service type — keyed by kind so the export formatter and
    -- Power BI read them without re-pivoting.
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
    -- County coverage with the phone that may be published for it
    -- (Lifeline: number public, specialist not).
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
    -- verified_on travels with the hours: the export and Power BI are
    -- exactly where the freshness date matters.
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
             '[]'::jsonb)                                      AS hours
FROM organisations o
LEFT JOIN organisation_categories oc ON oc.organisation_id = o.id
LEFT JOIN categories c ON c.id = oc.category_id AND c.is_active
WHERE o.status = 'published'
GROUP BY o.id;

COMMENT ON VIEW published_resources IS
    'Single feed for the professional export, the AI Navigator and Power BI.';

-- The meetings half of the directory, same contract.
CREATE VIEW published_meetings
WITH (security_invoker = true) AS
SELECT
    ms.id,
    ms.region_id,
    ms.slug,
    ms.name            AS meeting_name,
    ms.fellowship,
    ms.room,
    o.slug             AS organisation_slug,
    o.name             AS organisation_name,
    l.address_line1,
    l.city,
    l.state_code,
    l.postal_code,
    CASE WHEN l.geog IS NULL THEN NULL
         ELSE ST_Y(l.geog::geometry) END                      AS lat,
    CASE WHEN l.geog IS NULL THEN NULL
         ELSE ST_X(l.geog::geometry) END                      AS lng,
    COALESCE((SELECT array_agg(mt.code ORDER BY mt.code)
                FROM meeting_series_types mst
                JOIN meeting_types mt ON mt.id = mst.meeting_type_id
               WHERE mst.series_id = ms.id),
             '{}'::text[])                                     AS type_codes,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'day', s.day_of_week,
                   'start', s.start_time,
                   'duration_minutes', s.duration_minutes,
                   'weeks_of_month', s.weeks_of_month)
                 ORDER BY s.day_of_week, s.start_time)
                FROM meeting_schedules s
               WHERE s.series_id = ms.id),
             '[]'::jsonb)                                      AS schedule
FROM meeting_series ms
JOIN organisations o ON o.id = ms.organisation_id
LEFT JOIN locations l ON l.id = ms.location_id
WHERE ms.status = 'published';

-- =====================================================================
-- 10. ROW-LEVEL SECURITY  — on EVERY table
--     On Supabase a table without RLS in the public schema is writable
--     by anyone holding the anon key (it ships with the frontend), so
--     RLS is enabled everywhere. Lookup tables get read-only SELECT
--     policies; the anonymous role gets no write anywhere. Four tables
--     are private by design — contacts, practitioner_notes,
--     source_records and import_runs — and carry an explicit
--     USING (false) read policy: Postgres has no DENY, and the explicit
--     policy both documents the intent in SQL and passes Supabase's
--     security advisor with zero warnings (service_role bypasses RLS,
--     so admin access is unaffected).
--     The security advisor is run at deployment and again before
--     handoff; this schema is written to pass it clean.
-- =====================================================================
ALTER TABLE regions                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE counties                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE plain_language_topics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_synonyms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE attributes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_attributes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_notes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_areas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_hours        ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_series            ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_series_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_schedules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions               ENABLE ROW LEVEL SECURITY;

-- Lookup tables: public, read-only.
CREATE POLICY region_public_read ON regions
    FOR SELECT TO PUBLIC USING (true);

CREATE POLICY county_public_read ON counties
    FOR SELECT TO PUBLIC USING (true);

CREATE POLICY category_public_read ON categories
    FOR SELECT TO PUBLIC USING (is_active);

CREATE POLICY topic_public_read ON plain_language_topics
    FOR SELECT TO PUBLIC USING (is_active);

CREATE POLICY topic_category_public_read ON topic_categories
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM plain_language_topics t
                    WHERE t.id = topic_categories.topic_id
                      AND t.is_active)
       AND EXISTS (SELECT 1 FROM categories c
                    WHERE c.id = topic_categories.category_id
                      AND c.is_active));

-- The synonym table drives public search; the terms are not secret.
CREATE POLICY synonym_public_read ON search_synonyms
    FOR SELECT TO PUBLIC USING (true);

CREATE POLICY attribute_public_read ON attributes
    FOR SELECT TO PUBLIC USING (is_active);

CREATE POLICY crisis_line_public_read ON crisis_lines
    FOR SELECT TO PUBLIC USING (is_active);

CREATE POLICY meeting_type_public_read ON meeting_types
    FOR SELECT TO PUBLIC USING (is_active);

-- Core content, gated on publication.
CREATE POLICY org_public_read ON organisations
    FOR SELECT TO PUBLIC
    USING (status = 'published');

-- A place is visible if anything published happens there: an organisation
-- that operates from it, or a meeting that is held there.
CREATE POLICY location_public_read ON locations
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM organisation_locations ol
                    JOIN organisations o ON o.id = ol.organisation_id
                   WHERE ol.location_id = locations.id
                     AND o.status = 'published')
        OR EXISTS (SELECT 1 FROM meeting_series ms
                   WHERE ms.location_id = locations.id
                     AND ms.status = 'published'));

CREATE POLICY organisation_location_public_read ON organisation_locations
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM organisations o
                   WHERE o.id = organisation_locations.organisation_id
                     AND o.status = 'published'));

CREATE POLICY organisation_category_public_read ON organisation_categories
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM organisations o
                   WHERE o.id = organisation_categories.organisation_id
                     AND o.status = 'published'));

CREATE POLICY organisation_attribute_public_read ON organisation_attributes
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM organisations o
                   WHERE o.id = organisation_attributes.organisation_id
                     AND o.status = 'published'));

CREATE POLICY service_area_public_read ON service_areas
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM organisations o
                   WHERE o.id = service_areas.organisation_id
                     AND o.status = 'published'));

CREATE POLICY organisation_hours_public_read ON organisation_hours
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM organisations o
                   WHERE o.id = organisation_hours.organisation_id
                     AND o.status = 'published'));

CREATE POLICY meeting_public_read ON meeting_series
    FOR SELECT TO PUBLIC
    USING (status = 'published');

CREATE POLICY meeting_series_type_public_read ON meeting_series_types
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM meeting_series s
                   WHERE s.id = meeting_series_types.series_id
                     AND s.status = 'published'));

CREATE POLICY meeting_schedule_public_read ON meeting_schedules
    FOR SELECT TO PUBLIC
    USING (EXISTS (SELECT 1 FROM meeting_series s
                   WHERE s.id = meeting_schedules.series_id
                     AND s.status = 'published'));

-- Stories are public only when published AND consented — the brand
-- guide's written-consent rule, enforced at the database.
CREATE POLICY story_public_read ON stories
    FOR SELECT TO PUBLIC
    USING (status = 'published' AND consent_on_file);

-- Explicit no-read policies on the four private tables: visible in
-- SQL, silent in the security advisor.
CREATE POLICY contacts_no_public_read ON contacts
    FOR SELECT TO PUBLIC USING (false);

CREATE POLICY practitioner_notes_no_public_read ON practitioner_notes
    FOR SELECT TO PUBLIC USING (false);

CREATE POLICY source_records_no_public_read ON source_records
    FOR SELECT TO PUBLIC USING (false);

CREATE POLICY import_runs_no_public_read ON import_runs
    FOR SELECT TO PUBLIC USING (false);

-- Anyone may submit; nobody anonymous may read the queue back. The
-- table CHECK reinforces this: reviewer fields must be empty on a
-- pending row.
CREATE POLICY submission_public_insert ON submissions
    FOR INSERT TO PUBLIC WITH CHECK (status = 'pending');

-- =====================================================================
-- 11. HOUSEKEEPING
-- =====================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- One trigger per table carrying updated_at. Link tables whose rows are
-- only inserted or deleted (never updated) carry created_at only.
CREATE TRIGGER regions_touch                 BEFORE UPDATE ON regions                 FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER counties_touch                BEFORE UPDATE ON counties                FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER categories_touch              BEFORE UPDATE ON categories              FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER topics_touch                  BEFORE UPDATE ON plain_language_topics   FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER synonyms_touch                BEFORE UPDATE ON search_synonyms         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER attributes_touch              BEFORE UPDATE ON attributes              FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER crisis_lines_touch            BEFORE UPDATE ON crisis_lines            FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER organisations_touch           BEFORE UPDATE ON organisations           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER organisation_categories_touch BEFORE UPDATE ON organisation_categories FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER contacts_touch                BEFORE UPDATE ON contacts                FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER practitioner_notes_touch      BEFORE UPDATE ON practitioner_notes      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER stories_touch                 BEFORE UPDATE ON stories                 FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER locations_touch               BEFORE UPDATE ON locations               FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER organisation_locations_touch  BEFORE UPDATE ON organisation_locations  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER service_areas_touch           BEFORE UPDATE ON service_areas           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER organisation_hours_touch      BEFORE UPDATE ON organisation_hours      FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER meeting_types_touch           BEFORE UPDATE ON meeting_types           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER meeting_series_touch          BEFORE UPDATE ON meeting_series          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER meeting_schedules_touch       BEFORE UPDATE ON meeting_schedules       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER submissions_touch             BEFORE UPDATE ON submissions             FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Maintain organisations.category_labels (search weight B) whenever an
-- organisation's category links change, or a category is renamed or
-- (de)activated. The blanket variant runs on category changes; at ~318
-- organisations it is instant. Updating category_labels also recomputes
-- search_tsv, because the tsvector is a generated column.
-- Both halves are required: the is_active filter alone leaves labels
-- stale until the next edit, and the widened trigger without the filter
-- would refresh rows with the deactivated name still in them.
CREATE OR REPLACE FUNCTION refresh_org_category_labels() RETURNS trigger
LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
    UPDATE public.organisations o
       SET category_labels = COALESCE((
             SELECT string_agg(c.name, ' ')
               FROM public.organisation_categories oc
               JOIN public.categories c ON c.id = oc.category_id
              WHERE oc.organisation_id = o.id
                AND c.is_active), '')
     WHERE o.id = COALESCE(NEW.organisation_id, OLD.organisation_id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_all_category_labels() RETURNS trigger
LANGUAGE plpgsql
SET search_path = '' AS $$
BEGIN
    UPDATE public.organisations o
       SET category_labels = COALESCE((
             SELECT string_agg(c.name, ' ')
               FROM public.organisation_categories oc
               JOIN public.categories c ON c.id = oc.category_id
              WHERE oc.organisation_id = o.id
                AND c.is_active), '');
    RETURN NULL;
END;
$$;

CREATE TRIGGER organisation_categories_labels
    AFTER INSERT OR UPDATE OR DELETE ON organisation_categories
    FOR EACH ROW EXECUTE FUNCTION refresh_org_category_labels();

CREATE TRIGGER categories_labels
    AFTER UPDATE OF name, is_active ON categories
    FOR EACH ROW EXECUTE FUNCTION refresh_all_category_labels();

-- ---------------------------------------------------------------------
-- Directus isolation. Directus keeps its system tables (users, sessions,
-- tokens) in a dedicated schema named `directus`, not in public — and
-- Supabase only exposes schemas listed in the project's API settings,
-- so the defaults are already safe. Belt and braces: if the schema
-- exists, strip the API roles' grants on it, including future ones.
-- Guarded so the file also runs on a plain Postgres without those roles.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'directus')
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA directus FROM anon, authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA directus FROM anon, authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA directus REVOKE ALL ON TABLES FROM anon, authenticated';
        EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA directus REVOKE ALL ON SEQUENCES FROM anon, authenticated';
    END IF;
END;
$$;

-- The API roles need explicit SELECT on the two views (Supabase grants
-- on tables by default; views are on us). Guarded the same way.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'GRANT SELECT ON published_resources, published_meetings TO anon, authenticated';
    END IF;
END;
$$;

COMMIT;
