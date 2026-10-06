#!/usr/bin/env python3
"""
Trial import of the July 30 master spreadsheet into the Phase 0 schema.

Purpose is validation, not production: it proves the model holds the real
data, and surfaces every row that needs a human decision. The production
importer will be this logic plus geocoding.

⚠ PHASE 1 NOTE (2026-10-07) — this trial predates schema v1.1/v1.2 and
must NOT be used as a column-list reference. Known stale points, in
order of how loudly they fail against v1.3.1:

  1. contacts.is_public (line ~533) — v1.0 column, REMOVED in v1.1.
     Contacts are fully private now; publishable county numbers live on
     service_areas.public_phone. The generated SQL fails loudly here —
     expected, do not "fix" by patching this file.
  2. organisations.kind is never set — SILENT wrong default: all 137
     mutual-aid groups would carry kind='service' and pollute the
     services directory (schema section 4: kind keeps them out).
     Production must set kind='meeting_group' for mutual-aid rows.
  3. No import_runs / source_records rows — the v1.2 monthly-refresh
     bookkeeping (UID-keyed upsert, content_hash, vanished handling)
     does not exist here. Production imports write both tables.
"""
import re, sys, unicodedata
from collections import defaultdict, Counter
import pandas as pd

SRC = '/mnt/user-data/uploads/0_UIDMASTER_database_July_30__idenififers.xlsx'
OUT = '/home/claude/netn-phase0/out/import.sql'

# ---------------------------------------------------------------- counties
# Keyed by FIPS because the spreadsheet's county NAMES are ambiguous across
# state lines: its one Virginia row is filed under "Washington", and
# Washington Co. TN (47179) is a different place from Washington Co. VA.
# FIPS verified against the Census county list, not from memory.
TN = '47'
NETN = {  # the ten counties the directory is about
    'Carter': '019', 'Cocke': '029', 'Greene': '059', 'Hamblen': '063',
    'Hancock': '067', 'Hawkins': '073', 'Johnson': '091', 'Sullivan': '163',
    'Unicoi': '171', 'Washington': '179',
}
NEIGHBOURS = {'Grainger': '057', 'Jefferson': '089', 'Sevier': '155'}
COUNTIES = {}                       # (name, state) -> fips
for n, c in NETN.items():
    COUNTIES[(n, 'TN')] = TN + c
for n, c in NEIGHBOURS.items():
    COUNTIES[(n, 'TN')] = TN + c
# Bristol VA is an INDEPENDENT CITY — the Census treats it as its own
# county equivalent (51520), not part of Washington County VA (51191).
# The spreadsheet files it under "Washington", which is the adjacent
# county; mapping that literally would put a Virginia listing inside the
# Tennessee Washington County filter's neighbour rather than its own place.
COUNTIES[('Washington', 'VA')] = '51520'   # Bristol city, VA

# The lookup key above is what the SPREADSHEET says; this is what the
# county-equivalent is actually called. Keeps the source mapping honest
# without storing a wrong name.
FIPS_NAMES = {'51520': ('Bristol city', 'VA')}

DAYNAMES = ['sunday', 'monday', 'tuesday', 'wednesday',
            'thursday', 'friday', 'saturday']
DAY_RE = r'(?:Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day'

# Day tokens include common source misspellings ('Tursdays' appears once).
DAY_TOKEN = r'(?:Sun|Mon|Tues|Tue|Wednes|Wednis|Thurs|Turs|Thur|Fri|Satur|Sat)day'
SCHED_RE = re.compile(
    # Ordinal list separators are inconsistent: '1st, 3rd, & 5th' uses a
    # comma AND an ampersand between the last two, so allow any run of them.
    r'((?:(?:1st|2nd|3rd|4th|5th)[,&\s]*(?:and\s*)?)*)'
    r'((?:' + DAY_TOKEN + r's?(?:\s*(?:,|&|and)\s*)?)+|Daily|Every\s+day)'
    r'\s*at\s*'
    r'(\d{1,2}(?::\d{2})?\s*[APap]\.?[Mm]\.?)', re.I)

# Map a (possibly misspelled) day token onto the weekday enum.
DAY_CANON = {
    'sun': 'sunday', 'mon': 'monday', 'tues': 'tuesday', 'tue': 'tuesday',
    'wednes': 'wednesday', 'wednis': 'wednesday', 'thurs': 'thursday',
    'thur': 'thursday', 'turs': 'thursday', 'fri': 'friday',
    'satur': 'saturday', 'sat': 'saturday',
}

SERVES_RE = re.compile(r'Serves(?:\s+individuals\s+in)?\s+([^.]+?)\s+[Cc]ount', re.I)
PHONE_RE = re.compile(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
EMAIL_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')

warnings = []


def warn(kind, detail):
    warnings.append((kind, detail))


def q(v):
    """SQL literal."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int,)):
        return str(v)
    s = str(v).replace("'", "''")
    return "'" + s + "'"


def arr(vals):
    if not vals:
        return "'{}'"
    inner = ','.join('"' + str(v).replace('"', '\\"') + '"' for v in vals)
    return "'{" + inner + "}'"


_slugs = set()


def slug(text, prefix=''):
    s = unicodedata.normalize('NFKD', str(text)).encode('ascii', 'ignore').decode()
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    s = re.sub(r'-{2,}', '-', s) or 'item'
    base, n = s, 2
    while s in _slugs:
        s, n = f'{base}-{n}', n + 1
    _slugs.add(s)
    return s


def clean(v):
    if pd.isna(v):
        return None
    s = ' '.join(str(v).split())
    return s or None


def parse_people(cell):
    """'Ashley Street\\n(423) 518-1257' -> [{'name':..., 'phone':...}].

    Also handles several people in one cell, separated by blank lines,
    and bare values with no name.
    """
    if pd.isna(cell):
        return []
    blocks = [b for b in re.split(r'\n\s*\n', str(cell)) if b.strip()]
    out = []
    for b in blocks:
        lines = [l.strip() for l in b.split('\n') if l.strip()]
        name = phone = email = None
        for l in lines:
            if EMAIL_RE.fullmatch(l) or EMAIL_RE.search(l) and '@' in l:
                email = EMAIL_RE.search(l).group(0)
            elif PHONE_RE.search(l) and not re.search(r'[A-Za-z]{3}', l):
                phone = PHONE_RE.search(l).group(0)
            else:
                name = l if not name else name + ' ' + l
        if name or phone or email:
            out.append({'name': name, 'phone': phone, 'email': email})
    return out


def parse_schedule(text, label=''):
    """Return list of (weekday, HH:MM:SS, weeks_of_month|None).

    Handles: day lists ('Sundays, Tuesdays, & Fridays at 8:00 PM'),
    several clauses in one cell, week-of-month ordinals ('1st, 3rd, & 5th
    Thursdays'), 'Daily at 7:00 PM' (expands to all seven days), and the
    handful of day-name misspellings present in the source.
    """
    out = []
    for ordinals, days, tm in SCHED_RE.findall(text):
        weeks = sorted({int(x) for x in re.findall(r'([1-5])(?:st|nd|rd|th)', ordinals)})
        weeks = weeks or None
        m = re.match(r'(\d{1,2})(?::(\d{2}))?\s*([APap])', tm.strip())
        h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3).lower()
        if ap == 'p' and h != 12:
            h += 12
        if ap == 'a' and h == 12:
            h = 0
        stamp = f'{h:02d}:{mi:02d}:00'

        if re.fullmatch(r'\s*(?:Daily|Every\s+day)\s*', days, re.I):
            for dn in DAYNAMES:
                out.append((dn, stamp, weeks))
            continue

        for d in re.findall(DAY_TOKEN, days, re.I):
            stem = d.lower()[:-3]                    # strip trailing 'day'
            dn = DAY_CANON.get(stem)
            if dn is None:
                warn('day_token_unrecognised', f'{label}: {d!r}')
                continue
            if stem in ('turs', 'wednis', 'thur', 'tue', 'sat'):
                warn('day_spelling_corrected',
                     f'{label}: source says {d!r} -> read as {dn}')
            out.append((dn, stamp, weeks))
    return out


def parse_attributes(head, label=''):
    """Meeting attributes from the clause before the schedule.

    The source separates them inconsistently — ';' mostly, but also '/'
    and ','. Unknown tokens are flagged rather than dropped silently.
    """
    codes, unknown = [], []
    # ';' is the norm, but the source also uses '/', ',' and ' - '
    # ('Large Group Meeting - Supper, Worship, Open Share Groups').
    for tok in re.split(r'[;/,]|\s+-\s+', head):
        tok = ' '.join(tok.split()).strip(' .').lower()
        if not tok or re.search(DAY_TOKEN, tok, re.I):
            continue
        if tok.startswith('located in'):
            continue
        code = ALIAS_TO_CODE.get(tok)
        if code:
            codes.append(code)
        else:
            unknown.append(tok)
    if unknown:
        warn('meeting_attr_unmapped', f'{label}: ' + '; '.join(repr(u) for u in unknown))
    return list(dict.fromkeys(codes))


# --------------------------------------------------------------- meeting types
MEETING_TYPES = [
    ('O',  'Open',                 ['open'],                              'access'),
    ('C',  'Closed',               ['closed'],                            'access'),
    # 'accesible' is a source misspelling, kept as an alias so the import
    # normalises it rather than losing the accessibility flag.
    ('X',  'Handicap Accessible',  ['handicap accessible', 'handicap accesible',
                                    'wheelchair access'],                  'accessibility'),
    ('NS', 'No Smoking',           ['no smoking', 'no tobacco'],          'format'),
    ('D',  'Discussion',           ['discussion'],                        'format'),
    ('B',  'Big Book',             ['big book', 'big book study'],        'format'),
    ('ST', 'Step Study',           ['step study', '12 steps & 12 traditions',
                                    '12 steps and 12 traditions', 'steps',
                                    '12 step', 'traditions study'],       'format'),
    ('SP', 'Speaker',              ['speaker meetings', 'speaker',
                                    'lead speaker'],                      'format'),
    ('LIT', 'Literature',          ['literature'],                        'format'),
    ('BEG', 'Newcomers',           ['newcomers', 'beginners'],            'format'),
    ('W',  'Women Only',           ['women only'],                        'population'),
    ('M',  'Men Only',             ['men only'],                          'population'),
    ('VAR', 'Various Formats',     ['various formats'],                   'format'),
    ('LG', 'Large Group',          ['large group meeting', 'large group meetings',
                                    'open share groups', 'open share group'], 'format'),
    ('SM', 'Small Group',          ['small group meetings', 'small group meeting'], 'format'),
    # Below: discovered in the source during the trial import. Several are
    # genuinely useful filters the current spreadsheet has no column for.
    ('LGBTQ', 'LGBTQ+',            ['lgbtq', 'lgbt'],                     'population'),
    ('S',  'Spanish Speaking',     ['spanish'],                           'population'),
    ('Y',  'Young People',         ['youth only', 'students'],            'population'),
    ('A',  'Adults',               ['adults'],                            'population'),
    ('CC', 'Childcare Provided',   ['childcare provided',
                                    'preschool and childcare provided'],  'accessibility'),
    ('MED', 'Meditation',          ['meditation', 'daily reflections'],   'format'),
    ('CAN', 'Candlelight',         ['candlelight'],                       'format'),
    ('BT', 'Basic Text',           ['basic text', 'literature study',
                                    'basic text, literature study'],      'format'),
    ('SPR', 'Spiritual Principle', ['spiritual principle'],               'format'),
    ('TOP', 'Topic',               ['topic'],                             'format'),
    ('MEAL', 'Meal Provided',      ['supper', 'dinner', 'cafe time',
                                    'café time'],                         'format'),
    ('WOR', 'Worship',             ['worship', 'teaching or testimony'],  'format'),
]
ALIAS_TO_CODE = {a: c for c, _, al, _ in MEETING_TYPES for a in al}

CATEGORY_PREFIX = {
    'Advocacy Organization': 'AO', 'Collegiate Recovery Program': 'CRP',
    'Recovery/Drug Court': 'DRC', 'Harm Reduction Organization': 'HRO',
    'Mutual-Aid Organization': 'MAO', 'Peer Recovery Service': 'PRS',
    'Prevention Organization': 'PO', 'Recovery Community Center': 'RCC',
    'Recovery Community Organization': 'RCO', 'Recovery High School': 'RHS',
    'Recovery Informed Institutional Service': 'RIIS',
    'Recovery Residence': 'RR', 'Re-Entry Service Organization': 'RESO',
    'Treatment Service': 'TS',
}

TOPICS = [
    ('a-place-to-stay', 'A place to stay', ['Recovery Residence']),
    ('meetings-near-me', 'Meetings near me', ['Mutual-Aid Organization']),
    ('detox-and-treatment', 'Detox and treatment', ['Treatment Service']),
    ('someone-to-talk-to', 'Someone to talk to',
     ['Peer Recovery Service', 'Recovery Community Center',
      'Recovery Community Organization']),
    ('staying-safe', 'Staying safe', ['Harm Reduction Organization']),
    ('help-with-court-or-re-entry', 'Help with court or re-entry',
     ['Recovery/Drug Court', 'Re-Entry Service Organization']),
    ('help-at-school-or-college', 'Help at school or college',
     ['Collegiate Recovery Program', 'Recovery High School']),
]

SYNONYMS = [
    ('suboxone', 'Treatment Service'), ('methadone', 'Treatment Service'),
    ('detox', 'Treatment Service'), ('rehab', 'Treatment Service'),
    ('mat', 'Treatment Service'),
    ('aa', 'Mutual-Aid Organization'), ('na', 'Mutual-Aid Organization'),
    ('alcoholics anonymous', 'Mutual-Aid Organization'),
    ('narcotics anonymous', 'Mutual-Aid Organization'),
    ('sober living', 'Recovery Residence'), ('halfway house', 'Recovery Residence'),
    ('oxford house', 'Recovery Residence'),
    ('narcan', 'Harm Reduction Organization'),
    ('naloxone', 'Harm Reduction Organization'),
    ('needle exchange', 'Harm Reduction Organization'),
    ('fentanyl test strips', 'Harm Reduction Organization'),
    ('drug court', 'Recovery/Drug Court'),
    ('peer support', 'Peer Recovery Service'),
]


def main():
    df = pd.read_excel(SRC)
    df.columns = [c.strip() for c in df.columns]
    # Work with plain dicts holding real None. Going through iterrows() on a
    # str-dtype column turns missing values into float('nan'), which is
    # TRUTHY — that silently gave all 19 address-less rows a location on the
    # first run of this import.
    records = [
        {k: (None if (v is None or (isinstance(v, float) and pd.isna(v))) else v)
         for k, v in row.items()}
        for row in df.to_dict('records')
    ]
    for r in records:
        for c in ['County', 'Recovery Asset', 'City', 'Address', 'State',
                  'Website', 'Description', 'Additional Information']:
            r[c] = clean(r[c])

    sql = ["BEGIN;",
           "INSERT INTO regions (slug,name,settings) VALUES "
           "('netn-reach','Northeast Tennessee Reach','{}'::jsonb);",
           "\\set rid (SELECT id FROM regions WHERE slug='netn-reach')"]

    # counties -------------------------------------------------------
    seen_fips = set()
    for (name, st), fips in sorted(COUNTIES.items(), key=lambda kv: kv[1]):
        if fips in seen_fips:
            continue
        seen_fips.add(fips)
        disp_name, disp_state = FIPS_NAMES.get(fips, (name, st))
        inr = (st == 'TN' and name in NETN)
        sql.append(
            f"INSERT INTO counties (fips,name,state_code,in_region,region_id) "
            f"VALUES ({q(fips)},{q(disp_name)},{q(disp_state)},{q(inr)},"
            f"(SELECT id FROM regions WHERE slug='netn-reach'));")

    # categories -----------------------------------------------------
    cats = sorted({c.strip() for r in records
                   if r['Recovery Asset Categorization']
                   for c in str(r['Recovery Asset Categorization']).split(';')
                   if c.strip()})
    defs = parse_definitions()
    for i, c in enumerate(cats):
        d = defs.get(c.lower(), {})
        sql.append(
            f"INSERT INTO categories (region_id,slug,name,legacy_prefix,definition,"
            f"definition_source,source_urls,sort_order) VALUES "
            f"((SELECT id FROM regions WHERE slug='netn-reach'),"
            f"{q(slug(c))},{q(c)},{q(CATEGORY_PREFIX.get(c))},"
            f"{q(d.get('definition'))},{q(d.get('source'))},"
            f"{arr(d.get('urls', []))},{i*10});")

    for i, (s, label, members) in enumerate(TOPICS):
        _slugs.add(s)
        sql.append(
            f"INSERT INTO plain_language_topics (region_id,slug,label,sort_order) "
            f"VALUES ((SELECT id FROM regions WHERE slug='netn-reach'),"
            f"{q(s)},{q(label)},{i*10});")
        for m in members:
            if m not in cats:
                continue
            sql.append(
                f"INSERT INTO topic_categories (topic_id,category_id) VALUES "
                f"((SELECT id FROM plain_language_topics WHERE slug={q(s)}),"
                f"(SELECT id FROM categories WHERE name={q(m)}));")

    for term, cat in SYNONYMS:
        if cat not in cats:
            continue
        sql.append(
            f"INSERT INTO search_synonyms (region_id,term,category_id) VALUES "
            f"((SELECT id FROM regions WHERE slug='netn-reach'),{q(term)},"
            f"(SELECT id FROM categories WHERE name={q(cat)}));")

    for code, label, aliases, kind in MEETING_TYPES:
        sql.append(
            f"INSERT INTO meeting_types (region_id,code,label,aliases,kind) VALUES "
            f"((SELECT id FROM regions WHERE slug='netn-reach'),"
            f"{q(code)},{q(label)},{arr(aliases)},{q(kind)});")

    # ---------------------------------------------------------------
    # Group rows into organisations.
    #   * rows WITH an address group on (name, address, city)
    #   * rows WITHOUT one group on name alone — these are the coverage
    #     programmes (ROPS, Lifeline), one source row per county served
    # ---------------------------------------------------------------
    # Group by NAME. An organisation may operate from several addresses
    # (ReVida Recovery Center is in four cities, Recovery Resources
    # Recovery Living at ten) and may also have coverage rows with no
    # address at all — Lifeline Peer Project has an office in Johnson City
    # plus nine county rows. Grouping by name+address split all of those.
    groups = defaultdict(list)
    for r in records:
        groups[r['Recovery Asset']].append(r)

    stats = Counter()
    stats['source_rows'] = len(records)
    stats['organisations'] = len(groups)

    # ---------------------------------------------------------------
    # Pass 1: every distinct physical place, once. A venue shared by
    # several organisations (41 addresses in this data) becomes one row,
    # so geocoding runs once per place and "what else is here?" works.
    # ---------------------------------------------------------------
    def loc_zip(r):
        z = r['Zip']
        return f'{int(z):05d}' if z is not None and not pd.isna(z) else None

    def loc_key(r):
        # Street + city identifies the place. ZIP is deliberately excluded:
        # the source files 1425 E Center St, Kingsport under two different
        # ZIPs, which would otherwise split one venue into two rows.
        if r['Address'] is None:
            return None
        return (r['Address'].strip().lower(), (r['City'] or '').strip().lower())

    places = {}
    for r in records:
        k = loc_key(r)
        if k is None or k in places:
            continue
        st = r['State'] or 'TN'
        fips = COUNTIES.get((r['County'], st))
        if fips is None:
            warn('county_unmapped', f"{r['Recovery Asset']}: {r['County']!r}/{st!r}")
        if st == 'VA':
            warn('out_of_state_listing',
                 f"{r['Recovery Asset']}: the only non-Tennessee listing. Source "
                 f"says county 'Washington' + state VA, but Bristol VA is an "
                 f"independent city, so it is filed as Bristol city (51520), "
                 f"not Washington Co. VA (51191) and not Washington Co. TN "
                 f"(47179). Marked out-of-region — confirm it should appear.")
        places[k] = {'addr': r['Address'], 'city': r['City'], 'state': st,
                     'zip': loc_zip(r), 'fips': fips}

    zips = defaultdict(set)
    for r in records:
        k = loc_key(r)
        if k is not None and loc_zip(r):
            zips[k].add(loc_zip(r))
    for k, zs in zips.items():
        if len(zs) > 1:
            warn('zip_conflict',
                 f"{places[k]['addr']}, {places[k]['city']}: source gives "
                 f"{sorted(zs)} for the same address — kept {places[k]['zip']}")

    for k, p in places.items():
        sql.append(
            f"INSERT INTO locations (region_id,address_line1,city,state_code,"
            f"postal_code,county_fips) VALUES "
            f"((SELECT id FROM regions WHERE slug='netn-reach'),{q(p['addr'])},"
            f"{q(p['city'])},{q(p['state'])},{q(p['zip'])},{q(p['fips'])}) "
            f"ON CONFLICT DO NOTHING;")
    stats['locations'] = len(places)

    def loc_ref(k):
        """SQL subquery resolving a place back to its location id."""
        return (f"(SELECT id FROM locations WHERE lower(coalesce(address_line1,''))"
                f"={q(k[0])} AND lower(coalesce(city,''))={q(k[1])})")

    # ---------------------------------------------------------------
    # Pass 2: organisations
    # ---------------------------------------------------------------
    for name, rows in groups.items():
        first = rows[0]
        uids = [str(r['UID']) for r in rows]
        if len(rows) > 1:
            stats['merged_groups'] += 1
        oslug = slug(name)

        # conflicting scalar fields across merged rows -> flag, don't guess
        for col in ['Website', 'Description']:
            vals = {clean(r[col]) for r in rows if clean(r[col])}
            if len(vals) > 1:
                warn('field_conflict_on_merge',
                     f'{name}: {col} has {len(vals)} distinct values across {uids}')

        is_meeting = any('Mutual-Aid' in str(r['Recovery Asset Categorization'])
                         for r in rows)
        desc = clean(first['Description'])
        addl = clean(first['Additional Information'])

        # Additional Information is schedule/coverage metadata for meetings
        # and courts; keep it on the org only when it is neither.
        keep_addl = addl
        if is_meeting or (addl and SERVES_RE.search(addl)):
            keep_addl = None

        pub_phone = None
        people = parse_people(first['Phone'])
        if len(people) == 1 and not people[0]['name']:
            pub_phone = people[0]['phone']

        emails = parse_people(first['Email'])
        pub_email = None
        if len(emails) == 1 and not emails[0]['name']:
            pub_email = emails[0]['email']

        sql.append(
            f"INSERT INTO organisations (region_id,slug,name,description,"
            f"additional_info,website,public_phone,public_email,status,"
            f"last_verified_on,legacy_uids) VALUES "
            f"((SELECT id FROM regions WHERE slug='netn-reach'),{q(oslug)},{q(name)},"
            f"{q(desc)},{q(keep_addl)},{q(clean(first['Website']))},"
            f"{q(pub_phone)},{q(pub_email)},'published','2026-07-30',{arr(uids)});")
        oref = f"(SELECT id FROM organisations WHERE slug={q(oslug)})"

        # categories
        cset = {c.strip() for r in rows
                for c in str(r['Recovery Asset Categorization']).split(';') if c.strip()}
        for i, c in enumerate(sorted(cset)):
            sql.append(
                f"INSERT INTO organisation_categories (organisation_id,category_id,"
                f"is_primary) VALUES ({oref},"
                f"(SELECT id FROM categories WHERE name={q(c)}),{q(i == 0)});")
        stats['org_category_links'] += len(cset)

        # ---- contacts: one per distinct person across the merged rows
        seen, contact_keys = {}, []
        for r in rows:
            for p in parse_people(r['Phone']) + parse_people(r['Email']):
                if not p['name']:
                    continue
                k = p['name']
                if k not in seen:
                    seen[k] = {'name': k, 'phone': p['phone'], 'email': p['email'],
                               'variants': set()}
                    contact_keys.append(k)
                else:
                    if p['phone'] and seen[k]['phone'] and p['phone'] != seen[k]['phone']:
                        seen[k]['variants'].add(p['phone'])
                    seen[k]['phone'] = seen[k]['phone'] or p['phone']
                    seen[k]['email'] = seen[k]['email'] or p['email']
        for i, k in enumerate(contact_keys):
            c = seen[k]
            nr = bool(c['variants'])
            note = (f"source disagrees: also {', '.join(sorted(c['variants']))}"
                    if nr else None)
            if nr:
                warn('contact_phone_conflict', f"{name} / {k}: {note}")
            sql.append(
                f"INSERT INTO contacts (organisation_id,name,phone,email,is_public,"
                f"needs_review,review_note,sort_order) VALUES "
                f"({oref},{q(k)},{q(c['phone'])},{q(c['email'])},false,"
                f"{q(nr)},{q(note)},{i*10});")
            stats['contacts'] += 1

        # ---- places this organisation operates from (may be several)
        org_places = []
        for r in rows:
            k = loc_key(r)
            if k is not None and k not in org_places:
                org_places.append(k)
        for i, k in enumerate(org_places):
            sql.append(
                f"INSERT INTO organisation_locations (organisation_id,location_id,"
                f"is_primary) VALUES ({oref},{loc_ref(k)},{q(i == 0)}) "
                f"ON CONFLICT DO NOTHING;")
            stats['org_location_links'] += 1
            fips = places[k]['fips']
            if fips:
                sql.append(
                    f"INSERT INTO service_areas (organisation_id,county_fips) VALUES "
                    f"({oref},{q(fips)}) ON CONFLICT DO NOTHING;")
                stats['service_areas'] += 1
        if len(org_places) > 1:
            stats['orgs_with_multiple_locations'] += 1
        if not org_places:
            stats['orgs_without_location'] += 1

        # ---- coverage rows: a source row with no address names a county
        #      this organisation serves, and often the person covering it
        for r in rows:
            if loc_key(r) is not None:
                continue
            fips = COUNTIES.get((r['County'], r['State'] or 'TN'))
            if not fips:
                warn('county_unmapped', f"{name}: {r['County']!r}")
                continue
            ppl = [p['name'] for p in parse_people(r['Phone']) if p['name']]
            cref = (f"(SELECT id FROM contacts WHERE organisation_id={oref} "
                    f"AND name={q(ppl[0])})" if len(ppl) == 1 else 'NULL')
            sql.append(
                f"INSERT INTO service_areas (organisation_id,county_fips,contact_id) "
                f"VALUES ({oref},{q(fips)},{cref}) "
                f"ON CONFLICT (organisation_id,county_fips) DO UPDATE SET "
                f"contact_id = COALESCE(service_areas.contact_id, EXCLUDED.contact_id);")
            stats['service_areas'] += 1
            if len(ppl) == 1:
                stats['service_areas_with_named_contact'] += 1

        # ---- 'Serves X, Y and Z counties' in free text -> coverage
        for r in rows:
            ai = clean(r['Additional Information'])
            if not ai:
                continue
            m = SERVES_RE.search(ai)
            if not m:
                continue
            for cn in re.split(r',|&|\band\b', m.group(1)):
                cn = cn.strip().rstrip('.')
                if not cn:
                    continue
                fips = COUNTIES.get((cn, 'TN'))
                if not fips:
                    warn('served_county_unmapped', f'{name}: {cn!r}')
                    continue
                sql.append(
                    f"INSERT INTO service_areas (organisation_id,county_fips) VALUES "
                    f"({oref},{q(fips)}) ON CONFLICT DO NOTHING;")
                stats['service_areas_from_text'] += 1

        # ---- meetings: ONE SERIES PER SOURCE ROW, not per organisation.
        #      League of Ordinary Gentlemen runs four different meetings at
        #      four venues; RU Recovery three. Each is its own series.
        if not is_meeting:
            continue

        fellowship = None
        for f, pat in [('AA', r'Alcoholics Anonymous|^AA\b'),
                       ('NA', r'Narcotics Anonymous|^NA\b'),
                       ('Al-Anon', r'Al[-\s]?Anon'),
                       ('Alateen', r'Alateen'),
                       ('Celebrate Recovery', r'Celebrate Recovery'),
                       ('DAA', r'Drug Addicts Anonymous'),
                       ('SMART', r'SMART Recovery')]:
            if re.search(pat, name, re.I):
                fellowship = f
                break

        for r in rows:
            ai = r['Additional Information'] or ''
            slots = parse_schedule(ai, name)
            room = None
            rm = re.search(r'Located in ([^.]+)', ai)
            if rm:
                room = rm.group(1).strip()
            head = ai.split('.')[0] if ai else ''
            codes = parse_attributes(head, name) if (
                head and not SCHED_RE.search(head)) else []

            k = loc_key(r)
            if k is None:
                warn('meeting_without_location',
                     f'{name}: meeting has no address; needs a venue or online link')
                continue
            mslug = slug(f'{name}-{r["UID"]}-meeting')
            sql.append(
                f"INSERT INTO meeting_series (region_id,organisation_id,location_id,"
                f"name,slug,fellowship,room,status) VALUES "
                f"((SELECT id FROM regions WHERE slug='netn-reach'),{oref},{loc_ref(k)},"
                f"{q(name)},{q(mslug)},{q(fellowship)},{q(room)},'published');")
            stats['meeting_series'] += 1
            sref = f"(SELECT id FROM meeting_series WHERE slug={q(mslug)})"
            for code in dict.fromkeys(codes):
                sql.append(
                    f"INSERT INTO meeting_series_types (series_id,meeting_type_id) "
                    f"VALUES ({sref},(SELECT id FROM meeting_types WHERE code={q(code)}));")
            if not slots:
                warn('meeting_no_schedule', f'{name}: no parseable day/time')
            for dn, tm, weeks in slots:
                w = ('NULL' if not weeks
                     else "'{" + ','.join(str(x) for x in weeks) + "}'")
                sql.append(
                    f"INSERT INTO meeting_schedules (series_id,day_of_week,start_time,"
                    f"weeks_of_month) VALUES ({sref},{q(dn)},{q(tm)},{w}) "
                    f"ON CONFLICT DO NOTHING;")
                stats['meeting_schedules'] += 1

    sql.append('COMMIT;')
    with open(OUT, 'w') as f:
        f.write('\n'.join(sql) + '\n')

    print('=== TRIAL IMPORT BUILT ===')
    for k in ['source_rows', 'organisations', 'merged_groups',
              'orgs_with_multiple_locations', 'orgs_without_location',
              'locations', 'org_location_links',
              'org_category_links', 'contacts', 'service_areas',
              'service_areas_from_text', 'service_areas_with_named_contact',
              'meeting_series', 'meeting_schedules']:
        print(f'  {k:34s} {stats[k]}')
    print(f'\n=== {len(warnings)} rows flagged for human review ===')
    for kind, cnt in Counter(k for k, _ in warnings).most_common():
        print(f'  {kind:28s} {cnt}')
    print()
    for kind, d in warnings:
        print(f'  [{kind}] {d}')


def parse_definitions():
    """Category definitions + sources from the markdown Nick supplied."""
    try:
        txt = open('/mnt/user-data/uploads/02_Category_Definitions.md').read()
    except OSError:
        return {}
    out = {}
    for block in txt.split('\n## ')[1:]:
        lines = block.split('\n')
        title = lines[0].strip()
        body = '\n'.join(lines[1:])
        d = body.split('**Definition source:**')[0].strip()
        src = urls = None
        if '**Definition source:**' in body:
            src = body.split('**Definition source:**')[1].split('**Source links:**')[0]
            src = ' '.join(src.split())
        urls = re.findall(r'https?://\S+', body)
        # singularise the heading to match the categorization values
        key = title.rstrip('s') if title.endswith('s') else title
        for k in {title.lower(), key.lower(),
                  title.lower().replace('recovery / drug courts', 'recovery/drug court')}:
            out[k] = {'definition': d, 'source': src, 'urls': urls}
    return out


if __name__ == '__main__':
    main()
