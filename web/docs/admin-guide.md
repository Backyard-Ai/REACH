# REACH Admin Guide — for Directus editors and admins

This guide is for the people who use the Directus dashboard to manage
the directory. No coding required.

---

## Logging in

**URL:** https://reach-directus.fly.dev
**Your email:** (set by the admin)
**Password:** (set by the admin — change on first login via Profile)

---

## The main workflow: reviewing submissions

When someone submits a new listing or reports a correction, it arrives
in the review queue. Here's what to do.

### New listing submissions

1. **Content → Submissions** — find items with Status = `Pending`
2. **Click into a submission** — read the payload (the submitted data)
3. **Check the details:**
   - Is the organisation name correct and not a duplicate?
   - Are the categories appropriate?
   - Is the address real (Google it if unsure)?
   - Is the description in person-first language?
4. **If it looks good:** change Status to `Approved`
5. **The system automatically creates the organisation** as a `Draft`
   with all its categories, counties, and attributes linked
6. **Go to Content → Organisations** — find the new draft
7. **Review it, fix anything, then change Status to `Published`**

The listing is now live on the website, searchable, and on the map.

### Correction submissions ("this information is wrong")

1. **Content → Submissions** — find the correction
2. **Read the `details` field** — what does the submitter say is wrong?
3. **Find the organisation** (search by the name in the payload)
4. **Verify and fix the issue** directly on the organisation record
5. **Mark the submission** as `Approved` (if you made the fix) or
   `Rejected` (if the information was actually correct)

Corrections are manual by design — a human decides whether the submitter
is right before anything changes.

### Rejecting a submission

Change Status to `Rejected` and add a brief Review Note explaining why.
The submission stays in the queue as a record.

---

## Managing organisations

### Publishing / unpublishing

**Content → Organisations → find the listing → Status dropdown:**

- `Draft` — not visible on the public site
- `Published` — visible everywhere (site, map, search, export, chatbots)
- `Archived` — removed from public view, preserved in the database

Changes are reflected on the site immediately.

### Editing a listing

Click into an organisation to edit:
- **Description** — keep it in plain language, person-first
- **Phone / Email / Website** — public contact info
- **Categories** — link/unlink via the organisation_categories relation
- **Counties served** — manage via service_areas
- **Hours** — add via organisation_hours (one row per open span)
- **Locations** — the physical address (linked via organisation_locations)

### Flagged listings (needs_review)

Organisations with `needs_review = true` have a Review Note explaining
the issue. These are typically:
- **Merge conflicts** (source data disagreed about a website or description)
- **Missing schedules** (meetings with no day/time listed)
- **Data corrections** (wrong city, conflicting phone numbers)

Resolve the issue, then uncheck `needs_review` and clear the Review Note.

---

## Managing taxonomy

### Categories

**Content → Categories** — the 14 professional taxonomy categories.
Each has a definition, source, and URLs (from the taxonomy document).

Only edit definitions if the taxonomy document has been updated and
approved. Names should not change (the importer matches on them).

### Plain-language topics

**Content → Plain Language Topics** — the 10 browse topics shown on
the home page ("Get treatment", "Find a meeting", etc.).

Topics link to categories via **Topic Categories**. A topic can include
multiple categories (e.g., "Help for family & friends" includes
Mutual-Aid, Peer Recovery, and Prevention).

### Search synonyms

**Content → Search Synonyms** — 284 terms that map everyday language
to categories or topics. When someone searches "narcan", the synonym
system knows to look in Harm Reduction.

Adding a new synonym: create a new row with the term and link it to
exactly one category OR one topic.

---

## Crisis lines

**Content → Crisis Lines** — the four crisis numbers.

Each line tracks a `verified_on` date. Before launch (and periodically
after), verify each number and update the date. This is the data the
"Get Help Now" page and the site footer read.

---

## User management

**Settings → User Roles** — manage who has access.

| Role | What they can do |
|---|---|
| **Administrator** | Everything — including publishing, managing users, and editing the data model |
| **Editor** | Edit listings, review submissions, but cannot publish (that requires the admin click) |

To add an editor/admin: Settings → User Directory → Create New → set role to Editor/Admin.

---

## Tips

- **Search first** — before approving a new listing, search organisations
  to make sure it's not already in the directory under a different name.
- **Person-first language** — always use "person in recovery" rather than
  "addict" or "abuser". Check descriptions before publishing.
- **Last verified matters** — the site shows "Last verified" on every
  listing. When you review and confirm a listing, update the date.
- **Draft is your friend** — there's no rush to publish. A listing can
  stay in draft while you verify details.
- **The Review Note field is for future reviewers** — explain what you
  found and why you made a decision, so the next person understands.

---

*Questions? Check the main HANDOVER.md at the repo root.*
