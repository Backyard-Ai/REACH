# Northeast Tennessee Reach — Directory Data Model

**Phase 0 · Deliverable for sign-off** · version 1.3 · 4 October 2026

The structure the whole site rests on: what a listing is, how coverage differs
from an address, and how meetings are held. Written to be read before any code
is built, because changing it afterwards means redoing the import, the queries
and the admin at once.

Prepared by Silvia Barros · Bandida Tech Pte. Ltd.
Source: UID master, 30 July 2026 · 387 rows.
Target: PostgreSQL 15+ / PostGIS 3.4 (Supabase). This revision was executed
end-to-end on a real PostgreSQL 15 + PostGIS 3.4 instance before delivery
(v1.3.1 adds only the search-path pinning on the four functions).

---

## 01 · In one page

The spreadsheet has one row per listing-in-a-category. The database has one row
per real-world thing: an organisation, a place, a county, a meeting. Everything
else follows from that.

Four ideas do the work:

- **An organisation is the thing being listed.** It can belong to more than one
  category, operate from more than one address, and keep several contacts.
- **A place is separate from the organisation that uses it.** Places are
  shared — a church hall in Johnson City hosts fifteen different meetings.
- **Coverage is separate from address.** Every listing has any number of
  physical addresses — most have one, some none, and a few several — and
  zero or more counties it serves. A programme with no office is then an
  ordinary row, not a special case.
- **A meeting is an event series held at a place, with its own recurring
  schedule** — so one venue can host many, and one meeting can sit at several
  times in the week.

Everything arriving from the public — a new listing, an update to an existing
one, and a "this information is wrong" report from a listing page — lands in
one submissions queue. They differ only in how much of the form is filled in
and they end in the same decision by the same person, so there is one queue to
watch rather than two.

Taxonomy, plain-language labels, synonyms, crisis numbers and meeting
attributes are all stored as data, not written into the code. Adding
"Suboxone" as a search term, or renaming a category, is a row someone edits in
Directus — no developer, no deploy.

| 387 | 318 | 263 | 137 | 11 |
|---|---|---|---|---|
| source rows imported — none lost | organisations, once duplicates were merged | distinct places — shared venues resolved to one | mutual-aid rows; 134 carry day/time schedules | flags where the source contradicts itself and you decide |

Underneath sits a 25-table structure. Every table has row-level security
enabled; nothing unpublished can be read from the public site, and four tables
(staff contacts, practitioner notes, source records and import runs) are
fully private.
The database enforces its own rules — a meeting can't be saved without a day
and a time, a story with a photo can't exist without consent on file, and a
listing can't point at a county that doesn't exist. Bad data is refused rather
than merely discouraged.

---

## 02 · What changed since your review

Everything in the October review landed in the schema itself, not in setup
notes:

- **Row-level security on all 25 tables.** The eleven lookup tables carry
  read-only policies; the anonymous role has no write anywhere; the four
  private tables carry explicit deny-read policies so the security advisor
  passes clean.
- **Directus keeps its system tables in its own schema**, with the API roles'
  grants stripped if it ever appears.
- **Hours** (one row per open span, with a verified date) and **level of
  care**, **service type**, **language** and **eligibility** as attribute
  kinds — added now, so no enum migration later.
- **created/updated timestamps everywhere**; **source tracking** for the
  monthly refresh (section 07); a **published-resources view** as the single
  feed for the professional export, the AI Navigator and Power BI;
  **practitioner notes** as a fully private table; **crisis lines** as their
  own table with a per-line verified date.
- **Meeting groups are organisations with a kind**, so the services list stays
  clean of the 137 meeting listings.
- **Contacts are fully private**; the dialable county number lives on the
  service-area row — number public, specialist not.
- **Bristol VA files as Bristol city (FIPS 51520)**, out-of-region, flagged —
  never reassigned to either Washington County.
- **Stories** get their table now, with the consent model enforced by CHECK
  constraints and the public read policy.
- **Diacritic-insensitive search** wired into the indexes now
  ("espanol" finds "Español").

---

## 03 · The model

Four groups of tables:

**Taxonomy — editable data.** `categories` (the professional terms, with
definitions and sources), `plain_language_topics` ("A place to stay",
"Meetings near me"), `topic_categories`, `search_synonyms` (suboxone →
Treatment, sober living → Residence), `attributes` (access, populations,
payment, eligibility, language, level of care, service type), `crisis_lines`
(each number with its own verified date), `meeting_types` (Open, Closed,
Women… with aliases that normalise source spelling).

**The thing listed.** `organisations` (status, last_verified_on,
legacy_uids[], kind) with `organisation_categories` (M–N),
`organisation_attributes`, private `contacts` and `practitioner_notes`,
`organisation_hours`, and `stories` (consent-gated).

**Place & coverage.** `locations` — a PLACE, not a listing: address, city,
county_fips, PostGIS point, no owning organisation. `organisation_locations`
(M–N) says who operates where. `service_areas` (org × county × optional
contact, plus a publishable county phone) says who serves where.
`counties` is keyed by 5-digit FIPS.

**Meetings.** `meeting_series` (name, fellowship, room, location or online)
with `meeting_schedules` — one row per sitting, day, time, week-pattern — and
`meeting_series_types`.

**Intake & bookkeeping.** `submissions` (payload jsonb → the review queue),
`source_records` and `import_runs` (section 07). Two published views —
`published_resources` and `published_meetings` — are the single feed the
export, the Navigator and Power BI all read.

Every top-level content table also carries `region_id`, unused today, so a
second agency is an extension rather than a migration.

---

## 04 · Three decisions worth your sign-off

### 1 · A meeting is an event series, not an organisation

137 of the 387 source rows (35%) are mutual-aid meetings. They behave
differently from services: they recur at times rather than opening at hours,
one venue hosts many, and one meeting may sit several times a week. So a
meeting series and its schedule are their own tables, and a series with three
sittings has three schedule rows. Each group is still an organisation (a
series needs a parent, and some groups run four venues), but a kind field
keeps them out of the services list.

The Additional Information column turned out to be structured, not prose. 134
of the 137 rows carry day/time text the parser reads — including "Tuesdays at
1:30 PM, Thursdays at 8:30 AM, & Saturdays at 4:00 PM" and "1st, 3rd, & 5th
Thursdays". Three RU Recovery rows name a venue but no day or time anywhere.
How many distinct sittings the text becomes is an import output, not a source
count: "1st, 3rd, & 5th Thursdays at 7:30 PM" is one mention and three
sittings.

Field names follow the TSML / Meeting Guide format AA intergroups already
use, so meeting lists can be imported and exported rather than retyped. The
same column yields a real attribute vocabulary — Open, Handicap Accessible,
Discussion, Closed, Women Only — which the spreadsheet has no column for and
which becomes a usable filter.

### 2 · Coverage and address are separate concerns

The address-less records don't differ structurally from pinned ones — and
that is the point. Every listing has any number of physical addresses —
most have one, some none, and a few several (ReVida Recovery Center
operates from four) — and zero or more counties it serves. A treatment
centre has both: a pin, and the counties it takes referrals from. ROPS
has coverage and no pin. Modelling the
address-less rows as an exception would have needed a special case in every
query.

The reason this matters beyond tidiness: Lifeline Peer Project must not be
merged to one phone number. Each of its ten county rows names the peer
specialist covering it — Jeremiah Lovelady covers Washington, Greene,
Hawkins, Sullivan and Unicoi; Jennifer Street covers Carter and Johnson;
Lea Wilson covers Cocke and Hancock; James Raymond covers Hamblen. So
service_areas carries an
optional contact, and "who covers my county" stays answerable — the
specialist's name stays private while the county's number stays publishable.

Counties are keyed by 5-digit FIPS rather than by name, because Bristol
straddles the state line and both states have a Washington County. The table
is not limited to the NETN ten: the recovery courts also serve Grainger,
Jefferson and Sevier.

### 3 · A place does not belong to a listing

Locations have no owning organisation column; which organisations operate at
a place is a relationship. Two reasons, both in the data.

41 addresses host more than one distinctly-named organisation. 513 E Unaka
Ave, Johnson City has a recovery community centre plus fifteen different
meetings; 208 E. Unaka Ave. has five Frontier Health programmes. And 17
organisations operate from several addresses — ReVida Recovery Center in four
cities, Recovery Resources Recovery Living at ten.

Tying each location to one listing would have duplicated that venue fifteen
times, geocoded it fifteen times, and made "what else meets here?"
unanswerable. As modelled, the 387 source rows resolve to 263 distinct places
— so geocoding runs once per place, and a corrected address corrects every
listing at it.

---

## 05 · What the validation proved

Schema v1.3 was stood up on a real PostgreSQL 15 + PostGIS 3.4 instance and
run to completion — 162 statements, executed under ON_ERROR_STOP, with smoke
assertions covering publication, the private tables, the consent rules and
the search path. The numbers below were also re-counted directly against the
July file.

| What the site does | Result | Check |
|---|---|---|
| Every source row survives the merge | 387 UIDs retained across 318 organisations; none lost | pass |
| Duplicate listings collapse | ACTION Recovery Resource Center (AARRC) is one listing carrying {PRS10, RCO1} and both categories | pass |
| …but genuinely separate sites stay separate | Abundant Hope's men's and women's houses remain distinct listings | pass |
| County filter includes coverage-only programmes | A Hancock County resident sees 7 pinned listings and 4 more that serve the county without an office there | pass |
| Shared venues resolve to one place | 513 E Unaka Ave: 15 distinct meetings, 19 weekly sittings from 17 day/time mentions, one location row | pass |
| Bristol VA files under the right county | Bristol city (FIPS 51520), flagged out-of-region — not Washington Co. TN, not Washington Co. VA | pass |
| Contact people stay private, numbers stay public | 110 phone cells and 25 email cells embed named people; the contacts table has no public read at all, and the dialable county number sits on the service area | pass |
| Misspelled and diacritic-free search still finds listings | trigram indexes with unaccent: "espanol" matches "Español" | pass |
| Synonyms reach what text search cannot | "suboxone" appears in 8 listings but resolves to 62 treatment services through the synonym table | pass |
| Nothing private leaks | As a real non-bypass role: zero rows visible from contacts, practitioner notes, source records and import runs, while the published organisation and the consented story read fine | pass |
| Referential integrity | 0 orphans across locations, schedules, service areas and contacts | pass |

The earlier caveat — a PostGIS-free sandbox with a haversine stand-in — no
longer applies: this revision ran against real PostGIS.

---

## 06 · Eleven flags for a human

The import refuses to guess. Where the source disagrees with itself, it keeps
both readings, flags the row, and leaves the decision to you. These are all
of them, as the validator counted them.

| Flag | What the source says | Needs |
|---|---|---|
| ROPS – Region 1 / Matthew Crawford | Seven rows give (423) 612-6117; the Sullivan County row gives (423) 612-6113 | verify number |
| 1425 E Center St, Kingsport | Filed under both ZIP 37660 and 37664 — kept 37660 | confirm ZIP |
| 208 E. Unaka Ave., Johnson City | Filed under both ZIP 37601 and 37604 — kept 37601 | confirm ZIP |
| RU Recovery (×3) | Three venues named (Victory Baptist, Rock Heritage Baptist, Temple Baptist) but no day or time given anywhere | supply schedule |
| ETSU Family Medicine (website) | The Bristol and Johnson City rows carry different pages — one organisation, two locations, one website field | choose or annotate |
| ETSU Family Medicine (description) | The two rows also carry different descriptions | pick one |
| All Recovery Meeting (×2) | Johnson City and Mountain City rows carry different websites | pick one |
| Bristol Lifestyle Recovery | The only non-Tennessee listing; filed as Bristol city (51520), out-of-region — per your October decision | FYI — will appear unless you say otherwise |
| League of Ordinary Gentlemen | "3rd Tursdays at 6:00 PM" — read as Thursday | FYI |

Two things only you can answer:

**Category definitions.** The definitions file is marked draft and says it
should be reviewed before public launch. They are loaded into the schema with
their sources and will show on the category pages, so signing off the wording
is a content task with a launch deadline attached.

**The fields the spreadsheet has no column for** — access, level of care,
populations served, payment accepted, hours. The tables exist and are empty.
They fill through the submission form and the professional CSV over time; the
site will show *last verified: July 2026* on imported listings until then.

---

## 07 · The monthly refresh

Another update to the master file arrives in about a month, in the same
format, with no closure markers — rows just disappear. The schema is built
for that cycle rather than for a one-time load:

- The import matches on (source, UID) and **upserts** — existing rows are
  updated, never duplicated. A content hash per record makes "updated" vs
  "unchanged" one comparison, not a field-by-field diff.
- Every run writes an **import_runs** row: the file, its hash, and the
  added / updated / unchanged / vanished counts. The changes report is a
  query, not a reconstruction.
- A UID that vanishes from the new file is **never deleted and never quietly
  left published**: the organisation is flagged needs_review and counted as
  vanished, waiting for a human.

Refreshing the directory when the new file lands is then a modest job, not a
rebuild.

---

## 08 · What happens on approval

The build starts against this structure: Directus is pointed at it and picks
up every table as an editable collection, the production importer is this
same transformation plus geocoding, and the directory, map and meetings pages
are written against the queries already proven above.

If something here reads wrong, this is the cheap moment to say so. After the
import runs and the pages are written against it, the same change costs a
migration, a re-import and a rewrite of every query that touches it.

---

*Phase 0 deliverable · Northeast Tennessee Reach resource directory ·
Bandida Tech Pte. Ltd. · 4 October 2026 · Accompanied by schema.sql v1.3.1
(the DDL). The full output of the validation run in section 05 is available
on request.*
