# Email draft — to Nick

**Subject:** Schema v1.3.1 + the regenerated Directory Data Model

---

Hi Nick!

Thank you for the review.

1. I shared a Google Drive folder with you so we can work in the same space. Awesome!
2. Supabase is paid for. Thanks
3. Contract updated below. I will send you during the week signed
4. What else do you need from me?

Concretely, four things:

- **Decisions on the flagged rows** in section 06 — the ROPS phone number, the two ZIP conflicts, RU Recovery's three missing schedules, and which ETSU URL the organisation carries. Bristol is settled: filed under Bristol city (51520) as you decided, and it will appear in search and on the map, though it sits outside the ten county filters — say the word if you'd rather keep it out. Nothing publishes until the rest are looked at.
- **The category definitions approved** before launch — they're loaded into the schema with their sources and will show on the category pages.
- **Brand and content assets**: the vector logo files, the confirmed funding-acknowledgment wording, the four verified crisis numbers and the Get Help copy, and the CustomGPT embed code. Stories with written consents by mid-October, if any exist by then.
- **The remaining accounts** — Vercel, Directus and GitHub (Supabase is done), with me added as collaborator on each.

And the biggest one: **written approval of the document**. You've said I can keep moving, so I will start with the next steps following this schema — the importer + geocoding, the design system, the account setup — and keep you posted as I go. But the model-dependent work (directory pages, Directus on live data, the map) waits for that approval, so if the committee objects to anything it costs a conversation, not a rework.

Now, what's in the attachments. Schema v1.3.1 is v1.3 plus one hardening detail: the search path is pinned on all four functions, so the advisor passes clean of any findings, not merely of failures. The final file was executed end-to-end on a real PostgreSQL 15 + PostGIS 3.4 instance after the last touch-up — all statements, all smoke assertions, and the security advisor at zero warnings — so the PostGIS caveat from the September edition is gone.

Everything from your review is in: RLS on all 25 tables, Directus in its own schema, hours and level of care, the published views, private contacts with the county phone public, crisis lines with per-line verified dates, and the UID-keyed refresh with its changes report.

Just one correction for the record — Lifeline. The September document said nine county rows and Lovelady covering Greene, Hawkins, Sullivan and Unicoi; the file actually has ten rows (all ten counties), and Lovelady covers Washington too. Since you know these assignments better than the file does, flag anything that looks off: Street — Carter & Johnson; Wilson — Cocke & Hancock; Raymond — Hamblen; Lovelady — Washington, Greene, Hawkins, Sullivan & Unicoi.

The document also carries corrected numbers — 137 mutual-aid rows, Hancock 7 pinned + 4 coverage-only, "suboxone" 8 listings resolving to 62 treatment services.

Scope note unchanged: the re-runnable import adds ~10–15 hours, call it 118–138 total.

I'll give news in the coming days.

Silvia
Bandida Tech Pte. Ltd.
