-- =====================================================================
-- Seed the attribute vocabulary — the fields the submission form asks
-- for that the spreadsheet has no column for (proposal §3). These are
-- the structured multi-select options shown in the wizard; Directus
-- admins can add, edit, or remove them later.
--
-- Run once after schema + region. Idempotent.
-- =====================================================================

INSERT INTO attributes (region_id, kind, slug, label, sort_order)
SELECT (SELECT id FROM regions WHERE slug = 'netn-reach'), v.kind::attribute_kind, v.slug, v.label, v.ord
FROM (VALUES
  -- access
  ('access', 'wheelchair-accessible',  'Wheelchair accessible',         10),
  ('access', 'sign-language',          'Sign language available',        20),
  ('access', 'transportation',         'Transportation available',       30),
  ('access', 'childcare',              'Childcare on-site',              40),
  ('access', 'evening-hours',          'Evening hours available',        50),
  -- population
  ('population', 'adults',             'Adults',                         10),
  ('population', 'young-adults',       'Young adults (18–25)',           20),
  ('population', 'youth',              'Youth (under 18)',               30),
  ('population', 'women',              'Women',                          40),
  ('population', 'men',                'Men',                            50),
  ('population', 'lgbtq',              'LGBTQ+',                         60),
  ('population', 'veterans',           'Veterans',                       70),
  ('population', 'families',           'Families',                       80),
  ('population', 'pregnant-parenting', 'Pregnant / parenting women',    90),
  ('population', 'justice-involved',   'Justice-involved',              100),
  -- payment
  ('payment', 'medicaid',              'Medicaid',                       10),
  ('payment', 'medicare',              'Medicare',                       20),
  ('payment', 'private-insurance',     'Private insurance',              30),
  ('payment', 'sliding-scale',         'Sliding scale',                  40),
  ('payment', 'free',                  'Free',                           50),
  ('payment', 'self-pay',              'Self-pay',                       60),
  ('payment', 'state-funded',          'State-funded',                   70),
  ('payment', 'grant-funded',          'Grant-funded',                   80),
  -- service_type
  ('service_type', 'outpatient',       'Outpatient',                     10),
  ('service_type', 'iop',              'Intensive outpatient (IOP)',     20),
  ('service_type', 'php',              'Partial hospitalization (PHP)',  30),
  ('service_type', 'residential',      'Residential',                    40),
  ('service_type', 'detox',            'Detoxification',                 50),
  ('service_type', 'mat',              'Medication-assisted treatment',  60),
  ('service_type', 'recovery-coaching','Recovery coaching',              70),
  ('service_type', 'peer-support',     'Peer support',                   80),
  -- level_of_care
  ('level_of_care', '0-5-early',       '0.5 — Early intervention',       10),
  ('level_of_care', '1-outpatient',    '1 — Outpatient',                 20),
  ('level_of_care', '2-iop',           '2 — Intensive outpatient',       30),
  ('level_of_care', '3-residential',   '3 — Residential / inpatient',    40),
  ('level_of_care', '4-medical',       '4 — Medically managed',          50),
  -- eligibility
  ('eligibility', 'adults-18',         'Adults 18+',                     10),
  ('eligibility', 'referral-required', 'Referral required',              20),
  ('eligibility', 'assessment-first',  'Assessment required first',      30),
  ('eligibility', 'tn-residents',      'Tennessee residents',            40),
  -- language
  ('language', 'english',              'English',                        10),
  ('language', 'spanish',              'Spanish',                        20),
  ('language', 'asl',                  'American Sign Language',         30),
  ('language', 'interpretation',       'Interpretation available',       40)
) AS v(kind, slug, label, ord)
ON CONFLICT (region_id, kind, slug) DO NOTHING;
