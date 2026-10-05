Northeast Tennessee Reach — Website & Resource Directory
Project proposal (revised)
Prepared by: Silvia — Bandida Tech Pte. Ltd. Date: September 2026 Target: November community launch

This revision incorporates the changes agreed in our exchanges: database schema sign-off as a separate first phase, Directus as the administration layer, design-as-you-build rather than separate wireframes, a deterministic result export for professionals, and taxonomy and synonyms stored as data.


1. What we're building
A mobile-first resource directory for the recovery ecosystem across the ten Northeast Tennessee counties, serving three audiences: people seeking recovery, the people helping them (family, friends), and professionals and care navigators.

The current Excel sheet (387 listings, 13 recovery-asset categories) becomes a proper database — the single source of truth — that feeds the website, the GIS map, the AI Navigator and, later, Power BI. Listings are kept current mostly through a public "add or update your listing" form, with a human approving each change before it goes live.

Design goals, in your priority order:

Works perfectly, looks excellent. Fast, accessible, polished on a phone.
Launch-ready for November, with time for you to test and polish.
Cheap to run and easy to maintain by non-technical people.

Because REACH is state-funded and university-affiliated, the brand guide notes that Section 508 applies to digital deliverables. Accessibility is therefore treated as a requirement, not a nice-to-have, throughout this plan.


2. Recommended stack
A stack that is specifically good at "one developer builds it, non-technical people run it":

Layer
Choice
Why
Website
Next.js (React/TypeScript)
Fast, mobile-first, excellent SEO, easy to hand to any web developer later
Data layer
Server-side queries behind one access module
Scales to tens of thousands of listings; see section 5
Database
Supabase (Postgres + PostGIS)
Real relational database; PostGIS gives proper geographic queries ("within 25 miles of me"); free tier is enough for this data volume
Administration
Directus
Sits on top of the Supabase database. Relational editing, draft/publish, revision history and roles for non-technical staff, without building an admin interface by hand
Hosting
Vercel
Zero-maintenance deploys, HTTPS, global CDN
Map
MapLibre GL with a licensed tile provider
Interactive map with clustering and filters; addresses geocoded once at import
Search
Postgres full-text plus pg_trgm
Handles misspellings and partial words; the synonym table does the rest
Fonts
Google Fonts — League Spartan, Merriweather, Source Sans 3, Satisfy
Exactly the brand typefaces; open-licensed, no fees
Form spam protection
Cloudflare Turnstile (free)
Accessible CAPTCHA alternative
Transactional email
Resend (free tier)
"Your listing was approved / needs more information" emails to organisations
AI Navigator
CustomGPT.ai (yours, already built)
Embedded as a floating button and a section; fed from a nightly export of the database so it answers from live data
Dashboards
Power BI via read-only database connection
Connects directly to Postgres; no extra tooling needed (phase 2)


Estimated running cost: roughly $15–70/month. Directus hosting is $15–25; Vercel Pro ($20) and Supabase Pro ($25) only if traffic or storage outgrows the free tiers. Map tiles and geocoding are usually free at this volume but have their own terms — worth settling before the data import, since some providers don't permit storing coordinates. Plus a domain (~$15/year). CustomGPT is already yours.

Why the change on admin. My first draft used Supabase's built-in table editor. That's fine on a flat spreadsheet but poor once the data is properly normalised — nobody should be asked to edit a junction table by hand. Directus reads the existing Postgres schema rather than generating its own, so the database stays under our control while the admin gets a usable interface. It doesn't remove the review queue (public submissions come from organisations with no account), but it shrinks it, and it adds revision history and draft/publish for free. Roughly cost-neutral now, clearly better once someone is maintaining this without a developer.
Why not Airtable/Softr/WordPress?
No-code tools are quicker for a plain list but fall over on the parts that will make this project stand out: GIS queries, a real review and approval workflow, strict accessibility control, and performance on phones. A WordPress plugin stack needs constant security patching by someone technical. The stack above needs essentially no maintenance between feature requests.


3. What the Excel shows
The shape

387 rows × 27 columns; every row has a UID, name, county, category and description. Ten counties (Washington 131, Sullivan 75, Greene 42, Hamblen 29, Carter 26, Cocke 23, Hawkins 21, Johnson 18, Hancock 10, Unicoi 10).
13 categories in use (Recovery High Schools exists but is empty). Categories are stored twice — as a semicolon-separated text field and as 13 tick-box columns — and the two agree in all but one row. In the database this becomes a single many-to-many relationship.
Descriptions average ~340 characters — good, usable copy for cards and search.

Things to fix during import

One organisation = several rows. The UID is per category-row, so A.C.T.I.O.N. Recovery Resource Center appears as both PRS10 and RCO1, and Abundant Hope Ministries as RR14 and TS16. 69 names repeat, collapsing to 354 distinct organisation-and-location records. I'll merge them, keeping every original UID as an alias so nothing you've already referenced breaks. Not every repeat is a duplicate — Abundant Hope's men's and women's houses are genuinely separate locations and stay separate.
Contact people embedded in the Phone and Email cells. I'll split these into separate contact name, public phone and public email fields, and store the contact name as a private admin field rather than showing it publicly. That matches the brand guide's rule about not pairing identifiable individuals with service claims.
19 rows with no street address (Regional Overdose Prevention Specialists ×10, Lifeline Peer Project ×9 — one row per county served). These aren't an exception in the model: coverage and location are separate concerns, so every listing has zero or one point location and zero or more service areas.
Small tidying: trailing spaces in county names, zip codes stored as decimals, one Virginia row, and counties buried in free text in Additional Information.

Fields the submission form asks for that the sheet doesn't have yet Access, service types and level of care, populations served and eligibility, payments and insurance accepted, hours, and last verified. The database will have these columns from launch but they'll start empty for imported listings — the submission form and the professional bulk CSV are how they fill over time. I'd suggest launching with last verified = July 2026 for imported rows so users see honest dates.

Category definitions. The definitions document you sent fits straight into the schema: definition, source name and source URL per category, shown on the category pages and editable in Directus. It notes the definitions need review before public launch, so that's a content task on your side.


4. Page structure
Three principles drive the changes from the prototype: the site must work for someone who doesn't know the professional vocabulary, it shouldn't make anyone classify their own problem before they can search, and it must survive a phone on a weak rural signal.
Plain-language entry layer
The 13 categories are professional terms. "Recovery Informed Institutional Service" may mean little to a person in crisis. Every browse surface uses a plain-language layer mapping onto the real taxonomy underneath:

What the user sees
Maps to
A place to stay
Recovery Residences
Meetings near me
Mutual-Aid Organizations
Detox and treatment
Treatment Services
Someone to talk to
Peer Recovery Services, Recovery Community Centers
Staying safe
Harm Reduction Organizations
Help with court or re-entry
Recovery/Drug Courts, Re-Entry Services
Help at school or college
Collegiate Recovery, Recovery High Schools


The professional taxonomy stays intact in the database and drives the For Professionals filter set.

Stored as data, not code. Categories, plain-language labels, synonyms and definitions all live in database tables, editable in Directus. Nothing needs rebuilding to add a synonym or reword a label. This is also what makes search forgiving: "Suboxone" finds medication-assisted treatment, "AA" finds mutual aid, "sober living" finds recovery residences — and pg_trgm handles the misspellings on top.
Meetings are separated from services
134 of 387 listings (35%) are mutual-aid meetings. They behave differently from services — recurring events with times, not places with opening hours — and mixed into one list they would drown the other 253. Meetings get their own path ("Find a meeting") sharing the same data and map. The model is organisations, locations, meeting series and meeting schedules as separate tables, since one venue can host five different meetings. I'll look at aligning with the TSML/Meeting Guide format that AA intergroups already use, so existing meeting lists can be imported rather than maintained by hand.

Global (every page)

Header: wordmark, four nav items, prominent Get Help Now button. One tap opens a panel; the same content also lives at a shareable /get-help URL. This is the only place the brand's crisis red (#8C1D2F) appears.
Floating Ask the Navigator button (symbol mark as avatar, per the guide).
Footer: submit a listing, for professionals, privacy, crisis line repeated, ETSU/TOAC funding acknowledgment.
Navigation reduced to four items — Get Help · Find Resources · For Professionals · About — so it fits a phone without a hamburger. Resources and Map were separate in the prototype but are two views of one dataset. Stories nests under About.

1. Home — one search box, no dropdowns in the hero; filters appear as refinements after results. Four "Where would you like to start?" cards, each a genuinely different route rather than four doors to the same list: I need help now · Help for myself · Helping someone else (family support, Al-Anon, how to start the conversation) · I'm a professional. Browse by plain-language category; map preview; Ask the Navigator with suggested prompts.

2. Find Resources — list and map views sharing one filter state, filters in a bottom sheet on mobile. A "serving your whole county" band above map results for the address-less listings, which would otherwise be invisible on a map-first design. "Near me" (permission-based, never stored). Shareable URLs, so a filtered view or a single listing can be texted to someone.

3. Resource detail — all categories for that organisation after de-duplication, plain-language description, address and directions, one-tap phone, website, hours, populations and eligibility, payment accepted, counties served. Last verified shown prominently with a one-tap "this information is wrong" link — in a recovery directory, stale data means someone arrives at a closed facility on their worst day, and this is also what keeps the database current after handover. Prints cleanly and loads on a weak connection.

4. Get Help Now — the genuinely 24/7 options only: TN REDLINE (800-889-9789), 988, the Statewide Crisis Line (855-274-7471), and 911. The first three are one-tap dial. 911 sits behind a deliberate tap-through and is labelled for medical emergencies, because for this audience a 911 call can bring a police response, which is a documented reason people hesitate to call during an overdose. Then "what happens when you call" in plain language, and nearest walk-in options. All four numbers verified against TDMHSAS at build and again before launch.

5. For Professionals — the same search with the full professional taxonomy and filter set, plus a deterministic result export: a copy-results button producing clean text for pasting into a note or EHR, and a print view for handouts. Built from the filtered query rather than through the chatbot, because output going into a clinical note or a client's hands needs to be exactly the filtered set, reproducible, and carrying the last-verified dates. Downloadable CSV template for bulk submission.

6. Add or Update Your Listing — multi-step form covering every field on your list. Address auto-geocoded; submitter gets a confirmation email; the record enters the review queue.

7. AI Navigator — floating button on every page plus a section on Home. Suggested prompts and a visible statement of guardrails (not medical advice, always surfaces the crisis line, answers only from the directory, person-first language). Supports Public and Practitioner modes if your CustomGPT exposes them.

8. Stories (under About) — story cards and a story map. Photographs and identifiable details only with the written consent the brand guide requires; contributors can choose first-name-only, no photo, or county-level rather than pinned location.

9. About — mission, partners and ETSU/TOAC co-branding, the data behind the directory, and a slot for the Power BI embed in phase 2.

10. Admin (Directus) — relational editing, draft/publish and revision history for all listings, taxonomy, synonyms and stories. Plus the review queue: each public submission shown against the existing record, one click to approve, edit-then-approve, or reject with a note. Nothing publishes without that click.


5. Designing for growth
Three different things get called "scalable", and they're handled differently.

The dataset grows. All filtering, search and map queries run server-side against Postgres, with a GIN index for full-text search and a GiST index on the PostGIS geography column. This performs well into the tens of thousands of listings with no re-architecture. Results are cached and invalidated when a listing is published.

Another agency wants their own version. Branding tokens, county list, taxonomy labels, crisis numbers and page copy are configuration, not hardcoded values. A second deployment for another region is a config file plus a data import rather than a fork of the codebase.

Several agencies share one platform. Not built now, but not blocked either: every table carries a tenant/region key from day one and row-level security is written against it. Retrofitting this after launch would mean touching every table and every query, which is why the key goes in now even though nothing uses it yet.

The normalised schema — organisations, locations, services, categories, service areas and meeting schedules as separate related tables — is what makes all three possible, and it's what resolves the one-organisation-many-rows problem in the current Excel.


6. Brand implementation
The v0.2 guide is detailed enough to translate straight into code, which saves design time.

Colour tokens as given: --brand-primary #24114D, --brand-action #177A8C, --brand-accent #14B7C1, surfaces #F2F2F2/#FFF, body #2B2B33, crisis #8C1D2F (crisis banners only).
Contrast rules enforced in the component library: Reach Teal never used for text or interactive elements on light backgrounds; links and buttons in Mountain Teal or Phoenix Purple; white or Reach Teal on purple.
League Spartan Bold headlines, Merriweather subheads, Source Sans 3 body at 16px minimum, Satisfy only as an occasional accent.
44×44px minimum touch targets, 2px Mountain Teal focus ring with 2px offset, hover darken 10%, fully operable at 200% zoom and keyboard-only.
Logo clear space and minimum sizes (160px wordmark, 36px symbol, simplified diamond favicon) baked into the header component.
Copy and the Navigator follow the person-first language rule.

All typefaces and assets used will be open-licensed or supplied by you.


7. Security, privacy & good practice
No personal data about people seeking help is collected or stored. Search and map need no accounts; "near me" runs on-device.
Public data only for listings; staff contact names kept in a private field.
Row-level security: the public site can only read published records.
Admin accounts live in Directus with role-based permissions and revision history, so every change is attributable and reversible.
Submission form: spam protection, rate limiting, validation; nothing auto-publishes without a human approval click.
Secrets server-side only; HTTPS everywhere; automatic daily database backups.
Supabase, Vercel, Directus and GitHub accounts created under REACH's own accounts from day one — you own everything, including the code and the data.
README and a short admin video so a future developer or admin can pick it up.
8. Accessibility & performance
WCAG 2.1 AA / Section 508 target, verified with automated and manual (screen reader, keyboard) checks before launch.
Map has a list equivalent for screen readers; never colour alone for meaning.
Plain-language copy; reading level checked on Home and Get Help.
Performance budget: home page interactive in under 2 seconds on a mid-range phone on 4G.


9. Phases, timeline & effort
Phase 0 — Database design (fixed fee)
An entity-relationship diagram, the DDL, and a plain-English summary readable by everyone in your ETSU meeting, not only whoever reads SQL. Covers organisations, locations, categories and taxonomy, service areas, meeting series and schedules, and public submissions.

Phase 1 begins once you've confirmed approval in writing. Estimated 10–12 hours ($650 – $780).
Phase 1 — Build
No separate wireframe stage: design happens as the build happens, as you suggested.

Phase
Hours
Schema implementation, tenant key, indexes, data-access layer
6–7
Excel clean-up (merging organisations, splitting contacts), import, geocoding
10–12
Design system from the brand guide, config-driven branding, shared components
7–8
Home, navigation, Get Help Now
8–9
Directory: server-side search and filters, list, detail, plain-language taxonomy
15–17
Meetings path (series and schedules)
4–5
Interactive map (PostGIS queries, clustering, near-me, county-served band)
8–9
Directus setup: collections, roles, draft/publish, revisions
8–9
Submission form + review queue + approve→publish
7–8
For Professionals: filter set, CSV template, deterministic export and print view
8–9
Taxonomy, synonyms and definitions as editable data
3
AI Navigator embed + nightly data feed to CustomGPT
3
Stories and story map
6–7
About page + co-branding
3
Accessibility audit, cross-device QA, performance
8–10
Deployment, handover docs, admin training video
4
Total
108–123 hours

Phase 2 — After launch (quoted separately)
Power BI dashboard embed, automated bulk CSV import, saved and shareable resource lists, and full multi-tenancy if a shared platform is ever wanted.
Schedule
At ~25 hours/week, Phase 1 is 5–6 weeks. The critical path now includes your approval cycle as well as my hours: if the schema and subsequent checkpoints each wait for a weekly meeting, the calendar stretches regardless of how fast I work. Assuming approvals come back within two business days, a mid-September start puts a testable build in front of you in mid-October and a complete, content-loaded site by the end of October, leaving runway to test with real users before launch. We'll know more precisely after the first approval round.

What I need from you: vector logo files, confirmed funding-acknowledgment wording, approved category definitions, the four verified crisis numbers and Get Help copy, stories with written consents by mid-October, the CustomGPT embed code, and accounts for Supabase, Vercel, Directus and GitHub with me added as a collaborator.


10. Pricing
Rate: $65/hour, invoiced via Bandida Tech Pte. Ltd.





Phase 0 — Database design
$650 – $780 (10–12 hours), invoiced on delivery
Phase 1 — Build
$7,020 – $7,995 (108–123 hours)


Both phases are billed for actual hours worked, not the estimate. Phase 0 is invoiced on delivery; during Phase 1 an invoice goes out every 15 days for the hours worked in the preceding period, with a timesheet attached.

Third-party costs (map tiles and geocoding, Directus hosting, domain, transactional email, any Power BI licensing) are contracted and paid directly by you — roughly $15–70/month as set out in section 2.

After launch, an optional monthly retainer of 3–4 hours covers fixes, small changes and keeping dependencies current, or ad-hoc at the same hourly rate.

Out of scope (available as add-ons): the phase 2 items above, the CustomGPT bot itself, Power BI report design, content writing, and verifying or enriching existing listings with the new fields.


11. Next steps
Sign the services agreement.
Create the Supabase, Vercel, Directus and GitHub accounts (I'll send a short guide) and add me as a collaborator.
I deliver Phase 0 for your ETSU sign-off.
Build begins on written approval, with weekly check-ins and a live staging URL from week 2.



