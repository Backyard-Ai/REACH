-- =====================================================================
-- Auto-accept trigger: when a new_listing submission is approved in
-- Directus (or via any client), the organisation is created automatically
-- as a draft with all categories, counties, attributes, and location
-- linked. The reviewer then just publishes it.
--
-- This runs inside the database transaction — it's atomic, reliable,
-- and independent of Directus's flow system.
--
-- Run once. The trigger is IF NOT EXISTS (idempotent).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.accept_new_listing() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_region_id  bigint;
  v_org_id     bigint;
  v_loc_id     bigint;
  v_slug       text;
  v_base_slug  text;
  v_n          integer := 2;
  v_cat_name   text;
  v_county_name text;
  v_attr_label text;
BEGIN
  -- only fire on pending → approved for new_listing with a name
  IF NEW.status <> 'approved' OR OLD.status = 'approved' OR NEW.kind <> 'new_listing' THEN
    RETURN NEW;
  END IF;
  IF NEW.payload->>'name' IS NULL THEN
    RETURN NEW;
  END IF;

  -- resolve region
  SELECT id INTO v_region_id FROM public.regions WHERE slug = 'netn-reach';
  IF v_region_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- slugify with uniqueness
  v_base_slug := lower(regexp_replace(NEW.payload->>'name', '[^\w]+', '-', 'g'));
  v_base_slug := btrim(v_base_slug, '-');
  IF v_base_slug IS NULL OR v_base_slug = '' THEN v_base_slug := 'listing'; END IF;
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organisations WHERE slug = v_slug AND region_id = v_region_id) LOOP
    v_slug := v_base_slug || '-' || v_n;
    v_n := v_n + 1;
  END LOOP;

  -- create the organisation (draft — publishing is a separate human click)
  INSERT INTO public.organisations
    (region_id, slug, name, kind, description, website, public_phone, public_email, status)
  VALUES (
    v_region_id,
    v_slug,
    NEW.payload->>'name',
    'service',
    NEW.payload->>'description',
    CASE
      WHEN NEW.payload->>'website' IS NOT NULL AND NEW.payload->>'website' NOT LIKE 'http%'
        THEN 'https://' || (NEW.payload->>'website')
      ELSE NEW.payload->>'website'
    END,
    NEW.payload->>'phone',
    NEW.payload->>'email',
    'draft'
  ) RETURNING id INTO v_org_id;

  -- link categories by name
  FOR v_cat_name IN SELECT jsonb_array_elements_text(NEW.payload->'categories') LOOP
    INSERT INTO public.organisation_categories (organisation_id, category_id)
    SELECT v_org_id, id FROM public.categories WHERE name = v_cat_name AND region_id = v_region_id
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- create location if there's a street address
  IF NEW.payload->'address' IS NOT NULL AND NEW.payload->'address'->>'street' IS NOT NULL THEN
    INSERT INTO public.locations
      (region_id, address_line1, city, state_code, postal_code, county_fips)
    VALUES (
      v_region_id,
      NEW.payload->'address'->>'street',
      NEW.payload->'address'->>'city',
      COALESCE(NEW.payload->'address'->>'state', 'TN'),
      NEW.payload->'address'->>'zip',
      (SELECT fips FROM public.counties WHERE name = NEW.payload->'address'->>'county')
    ) RETURNING id INTO v_loc_id;

    INSERT INTO public.organisation_locations (organisation_id, location_id, is_primary)
    VALUES (v_org_id, v_loc_id, true);

    -- home county service area
    INSERT INTO public.service_areas (organisation_id, county_fips)
    SELECT v_org_id, fips FROM public.counties WHERE name = NEW.payload->'address'->>'county'
    ON CONFLICT DO NOTHING;
  END IF;

  -- counties served (coverage)
  FOR v_county_name IN SELECT jsonb_array_elements_text(NEW.payload->'counties_served') LOOP
    INSERT INTO public.service_areas (organisation_id, county_fips)
    SELECT v_org_id, fips FROM public.counties WHERE name = v_county_name
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- attributes: populations
  FOR v_attr_label IN SELECT jsonb_array_elements_text(NEW.payload->'populations') LOOP
    INSERT INTO public.organisation_attributes (organisation_id, attribute_id)
    SELECT v_org_id, id FROM public.attributes WHERE label = v_attr_label AND kind = 'population'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- attributes: payment
  FOR v_attr_label IN SELECT jsonb_array_elements_text(NEW.payload->'payment') LOOP
    INSERT INTO public.organisation_attributes (organisation_id, attribute_id)
    SELECT v_org_id, id FROM public.attributes WHERE label = v_attr_label AND kind = 'payment'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- attributes: accessibility
  FOR v_attr_label IN SELECT jsonb_array_elements_text(NEW.payload->'accessibility') LOOP
    INSERT INTO public.organisation_attributes (organisation_id, attribute_id)
    SELECT v_org_id, id FROM public.attributes WHERE label = v_attr_label AND kind = 'access'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- attributes: languages
  FOR v_attr_label IN SELECT jsonb_array_elements_text(NEW.payload->'languages') LOOP
    INSERT INTO public.organisation_attributes (organisation_id, attribute_id)
    SELECT v_org_id, id FROM public.attributes WHERE label = v_attr_label AND kind = 'language'
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- auto-fill the review timestamp
  NEW.reviewed_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS accept_new_listing_trigger ON public.submissions;
CREATE TRIGGER accept_new_listing_trigger
  AFTER UPDATE ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.accept_new_listing();
