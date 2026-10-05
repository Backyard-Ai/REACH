# Email draft — to Nick

**Subject:** Schema v1.2 — your review is in, all of it landed

---

Hi Nick,

The revised schema is done and re-tested end to end. Everything in your review went in — nothing needed arguing — and a second internal pass on top of it caught a few more things. Version 1.2 is attached; since nothing is deployed yet, it regenerates the schema cleanly rather than migrating.

**Your three areas:**

1. **Row-level security.** RLS is now on every table — all 24 of them. The eleven lookup tables you listed carry read-only SELECT policies, and the anonymous role has no write anywhere. Four tables (contacts, practitioner notes, source records, import runs) have *no* public policy at all, which makes them invisible to the public role rather than merely unlisted. The security advisor runs at deployment and again before handoff.

2. **Directus.** It keeps its system tables in its own `directus` schema, which Supabase doesn't expose by default — and the script additionally strips anon/authenticated grants on it if the schema ever exists. Belt and braces.

3. **Hours and level of care.** Both in. An `organisation_hours` table (org, optional location, day, opens, closes, note, verified_on) and `level_of_care`, `service_type`, `language` and `eligibility` all added to the attribute kinds now, so there's no migration later.

**Your cheap-now list — all taken:**
- `created_at`/`updated_at` on every content table, one shared touch trigger.
- Source tracking: a `source_records` table keyed on (source_system, UID), plus an `import_runs` table — see below.
- A `published_resources` view (and a `published_meetings` twin) as the single feed for the export, the Navigator and Power BI. They're security-invoker views, so whoever queries them sees exactly what RLS allows — the BI role can't see more than the site does.
- Practitioner notes as their own table with no public policy. A column would have ridden along with every public read; a policy-less table can't.
- **Crisis numbers: my thought is keep them.** The Get Help Now page is the most important page on the site, and removing the numbers would gut it. But you're right that they deserved better than a JSON blob — they're now a `crisis_lines` table with a `verified_on` per line, so the verification you asked for is an auditable data event, and a line can be retired without editing a blob.

**Your four questions:**
1. Yes — every meeting group became an organisation, because a meeting series needs a parent. There's now an `organisations.kind` ('service' / 'meeting_group') and a pre-filtered index, so the services list stays clean.
2. Done differently, and better: contacts are now *fully* private (no public read at all — row-level security can't hide a name while showing a number from the same row). The publishable county number lives on the service-area row itself as `public_phone`. So Lifeline reads "Carter County — (423) …" — dialable, unattributed.
3. Yes — added now, per above.
4. Agreed — Bristol VA files under its own FIPS (51520, "Bristol city"), out-of-region and flagged, never silently reassigned to either Washington County.

**The monthly refresh** — your two asks are now structural, not importer discipline:
- The import matches on (source, UID) and upserts; a content hash per record means "updated" vs "unchanged" is one comparison, not a field-by-field diff.
- Every run writes an `import_runs` row: the file, its hash, and added / updated / unchanged / vanished counts — your changes report is a SELECT. A UID that disappears is never deleted and never quietly left published: the organisation is flagged `needs_review` and counted as vanished, waiting for you.

**One correction to my own numbers:** I re-counted the July file — it holds **137** mutual-aid rows, not the 134 in my Phase 0 document (and 35% still holds). The plain-English document is being regenerated to match, along with a fix to an internal inconsistency in its meeting-sitting counts.

**One honest scope note:** the re-runnable import machinery above adds roughly 10–15 hours to the Phase 1 estimate — call it 118–138 hours, at the same rate. I'd rather flag it now than discover it in November. If the budget needs to hold at the original number, the import-runs reporting is the piece we could simplify — but given the second file arrives about a month in, I'd keep it.

Next up: the regenerated plain-English doc for your ETSU meeting, then the build starts on your written approval as planned.

Silvia
Bandida Tech Pte. Ltd.
