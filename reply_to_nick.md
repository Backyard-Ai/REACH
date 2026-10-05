# Reply to Nick — Phase 0 feedback

Hi Nick,

Thanks — this is exactly the right list, and nearly all of it is in. The revised schema (v1.1) is attached; everything below refers to it. One general answer to your opening question first: the deployment-time items (grants, the advisor) do sort themselves out during setup, but the RLS and schema-shape items don't — they had to be in the DDL, so they now are.

**1. Row-level security.** Agreed, and fixed properly: all 23 tables in v1.1 (v1.0's 19 plus the four new ones below) have RLS enabled, the lookup tables get read-only SELECT policies, and the anonymous role has no write anywhere. Your instinct was right that it wouldn't self-fix — on Supabase, a public-schema table without RLS is writable by anyone holding the anon key, and that key ships with the frontend. The security advisor gets run at deployment and again before handoff; the schema is written to pass it.

**2. Directus.** One correction in your favour: Directus keeps its system tables in its own schema (`directus`), not in `public`, and Supabase only exposes schemas you list in the project's API settings — so the default setup doesn't leak them. I've still added a guard to v1.1 that revokes the API roles' grants on that schema if it exists, and I'll verify the exposed-schemas configuration during setup. Belt and braces.

**3. Hours.** Fair catch — the proposal promised them on the detail page and the schema didn't have them. `organisation_hours` is in now, essentially as you specced: organisation, optional location, day, opens, closes, note, plus a `verified_on`. Level of care went in as a new attribute kind (see Q3).

**The cheap-now additions — all in:**

- **Timestamps** on all content tables, with one generalized touch trigger.
- **Source tracking** — and this turned out to be the keystone rather than a nicety; more under "the monthly refresh" below.
- **A `published_resources` view** — plus `published_meetings`, since a third of the directory is meetings and the Navigator needs that half too. One contract for the professional export, the nightly feed and Power BI, so they can never disagree with the site.
- **`practitioner_notes`** — as its own table, not a column: RLS is row-level, so a column on organisations would ride along with every public read of that row. A table with no public policy at all is invisible — not merely unlisted — to the public role.
- **Crisis numbers** — kept, but as their own table with a `verified_on` per line. Dropping them isn't right (Get Help Now is a core page), and JSON can't carry per-line verified dates, which is the whole discipline behind "verified at build and again before launch". You get retirement and ordering for free too.

**Your four questions:**

1. **Right guess** — every meeting group became an organisation, because a series needs one and some groups run four venues. `organisations.kind` is now `'service' | 'meeting_group'` (default `service`); the import tags the groups, the services directory filters to services, and the meetings path doesn't care. I deliberately did *not* make the organisation field nullable on meeting_series — that would lose the group's own phone and website and break the one-group-many-venues case.
2. **Solved, slightly differently than a privacy-flag pair.** Contacts are now entirely admin-side (no public read at all), and `service_areas` gained `public_phone` — so the county-served band shows "Carter County: (423) 555-0123" with no name attached. The reason: RLS can't hide a single column inside a readable row, so separate name/phone flags would still leak names with the numbers. The database now enforces exactly what you asked for — number public, specialist private.
3. **Done** — `attribute_kind` now carries `service_type`, `language` and `level_of_care`, so there's no enum migration in our future. (Meeting formats keep their own vocabulary on `meeting_types`, where it already lives.)
4. **Already filed that way** in the current import: Bristol city, FIPS 51520, marked out-of-region and flagged for your confirm. The Phase 0 PDF described an earlier import run — I'm regenerating it so the document matches the code.

**The monthly refresh.** Understood, and the schema is now built for it. `source_records` maps every source UID to the rows it produced (first_seen / last_seen). The production importer matches on UID and upserts — existing rows get updated, never duplicated — and any UID in the database but missing from the new file is flagged `needs_review`, kept published, and listed in that run's changes report (added / updated / unchanged / vanished). Nothing is deleted, nothing goes quietly. One scope note, flagged rather than absorbed: the proposal priced a one-time clean-up and import (10–12h); the refreshable importer plus the diff report is a modest addition — roughly 4–6 hours on that block.

**Timeline.** With sign-off this week, Phase 1 starts mid-October and November holds — but the runway for testing with real users is thinner than the proposal assumed, so if sign-off slips past next week it's worth a quick call about scope or date.

Still on your side from Phase 0: the eleven flagged rows (the ROPS phone number, the two ZIP conflicts, RU Recovery's three missing schedules, the two website conflicts, Bristol's confirm), and the category definitions before launch.

v1.1 attached — the plain-English companion, regenerated to match, follows in a day or two. If this reads right, written approval starts the clock.

Silvia
