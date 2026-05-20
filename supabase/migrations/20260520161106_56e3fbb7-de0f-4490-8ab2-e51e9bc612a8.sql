
CREATE OR REPLACE FUNCTION public.merge_duplicate_clients()
RETURNS TABLE(merged_name text, primary_id uuid, removed_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  grp RECORD;
  d RECORD;
  primary_row public.clients%ROWTYPE;
  dup_ids uuid[];
  fk_tables text[] := ARRAY[
    'ad_budgets','ad_performance_intern','ad_performance_kunden',
    'close_activities','close_contacts','close_deals','close_leads',
    'close_opportunities','close_tasks','creative_projects',
    'finance','kunde_close_deals','kunde_meta_accounts','onepage_projects',
    'projects','tasks','time_entries'
  ];
  tbl text;
  primary_has_link boolean;
BEGIN
  FOR grp IN
    SELECT lower(trim(name)) AS key,
           array_agg(id ORDER BY (
             (CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) +
             (CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) +
             (CASE WHEN website_url IS NOT NULL THEN 1 ELSE 0 END) +
             (CASE WHEN unternehmen_id IS NOT NULL THEN 1 ELSE 0 END) +
             (CASE WHEN notion_id IS NOT NULL THEN 1 ELSE 0 END) +
             (CASE WHEN kundenstatus::text <> 'Lead' THEN 2 ELSE 0 END)
           ) DESC, created_at ASC) AS ids
      FROM public.clients
     WHERE name IS NOT NULL
       AND lower(trim(name)) NOT IN ('unbekannt','')
     GROUP BY lower(trim(name))
    HAVING COUNT(*) > 1
  LOOP
    SELECT * INTO primary_row FROM public.clients WHERE id = grp.ids[1];
    dup_ids := grp.ids[2:array_length(grp.ids,1)];

    FOREACH tbl IN ARRAY fk_tables LOOP
      EXECUTE format('UPDATE public.%I SET client_id = $1 WHERE client_id = ANY($2)', tbl)
        USING primary_row.id, dup_ids;
    END LOOP;
    UPDATE public.onepage_projects SET client_id_fk = primary_row.id WHERE client_id_fk = ANY(dup_ids);

    -- close_link has UNIQUE(client_id): keep primary's row if any, else move oldest dup row, drop the rest
    SELECT EXISTS(SELECT 1 FROM public.close_link WHERE client_id = primary_row.id) INTO primary_has_link;
    IF primary_has_link THEN
      DELETE FROM public.close_link WHERE client_id = ANY(dup_ids);
    ELSE
      UPDATE public.close_link SET client_id = primary_row.id
       WHERE id = (SELECT id FROM public.close_link WHERE client_id = ANY(dup_ids) ORDER BY created_at ASC LIMIT 1);
      DELETE FROM public.close_link WHERE client_id = ANY(dup_ids);
    END IF;

    FOR d IN SELECT * FROM public.clients WHERE id = ANY(dup_ids) ORDER BY created_at LOOP
      UPDATE public.clients SET
        email              = COALESCE(email, d.email),
        phone              = COALESCE(phone, d.phone),
        website            = COALESCE(website, d.website),
        website_url        = COALESCE(website_url, d.website_url),
        branche            = COALESCE(branche, d.branche),
        branche_id         = COALESCE(branche_id, d.branche_id),
        unternehmen_id     = COALESCE(unternehmen_id, d.unternehmen_id),
        projekttyp         = COALESCE(projekttyp, d.projekttyp),
        zahlstatus         = COALESCE(zahlstatus, d.zahlstatus),
        laufzeit           = COALESCE(laufzeit, d.laufzeit),
        startdatum         = COALESCE(startdatum, d.startdatum),
        enddatum           = COALESCE(enddatum, d.enddatum),
        deadline           = COALESCE(deadline, d.deadline),
        laufzeit_in_14t    = COALESCE(laufzeit_in_14t, d.laufzeit_in_14t),
        clv                = COALESCE(clv, d.clv),
        gesamt_saldo       = COALESCE(gesamt_saldo, d.gesamt_saldo),
        ads_budget         = COALESCE(ads_budget, d.ads_budget),
        cash_collect_offen = COALESCE(cash_collect_offen, d.cash_collect_offen),
        meta_kosten        = COALESCE(meta_kosten, d.meta_kosten),
        crm_kosten         = COALESCE(crm_kosten, d.crm_kosten),
        superchat_kosten   = COALESCE(superchat_kosten, d.superchat_kosten),
        website_kosten     = COALESCE(website_kosten, d.website_kosten),
        vor_nachname       = COALESCE(vor_nachname, d.vor_nachname),
        notion_url         = COALESCE(notion_url, d.notion_url),
        notion_id          = COALESCE(notion_id, d.notion_id),
        notes              = COALESCE(notes, d.notes),
        meta_account_id    = COALESCE(meta_account_id, d.meta_account_id),
        meta_account_ids   = (SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(meta_account_ids,'{}'::text[]) || COALESCE(d.meta_account_ids,'{}'::text[])) AS x WHERE x IS NOT NULL)),
        kundenstatus       = CASE WHEN kundenstatus::text = 'Lead' AND d.kundenstatus::text <> 'Lead' THEN d.kundenstatus ELSE kundenstatus END,
        updated_at         = now()
      WHERE id = primary_row.id;
    END LOOP;

    DELETE FROM public.clients WHERE id = ANY(dup_ids);

    merged_name := primary_row.name;
    primary_id := primary_row.id;
    removed_count := array_length(dup_ids, 1);
    RETURN NEXT;
  END LOOP;
END;
$$;

SELECT * FROM public.merge_duplicate_clients();

CREATE OR REPLACE FUNCTION public.upsert_client_from_notion(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_notion_id text := p->>'notion_id';
  v_name text := COALESCE(NULLIF(trim(p->>'name'),''),'Unbekannt');
  v_key text := lower(v_name);
BEGIN
  SELECT id INTO v_id FROM public.clients WHERE notion_id = v_notion_id LIMIT 1;

  IF v_id IS NULL AND v_key NOT IN ('unbekannt','') THEN
    SELECT id INTO v_id FROM public.clients
     WHERE lower(trim(name)) = v_key
     ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.clients (
      notion_id, notion_url, name, vor_nachname, email, phone, website_url,
      kundenstatus, ampelstatus, zahlstatus, branche, unternehmen_id, projekttyp,
      laufzeit, startdatum, enddatum, deadline, laufzeit_in_14t, clv, gesamt_saldo,
      ads_budget, cash_collect_offen, meta_kosten, crm_kosten, superchat_kosten, website_kosten
    ) VALUES (
      v_notion_id, p->>'notion_url', v_name, p->>'vor_nachname', p->>'email', p->>'phone', p->>'website_url',
      COALESCE(NULLIF(p->>'kundenstatus','')::kundenstatus, 'Lead'::kundenstatus),
      COALESCE(NULLIF(p->>'ampelstatus','')::ampelstatus, 'Grün'::ampelstatus),
      p->>'zahlstatus', p->>'branche', NULLIF(p->>'unternehmen_id','')::uuid, p->>'projekttyp',
      p->>'laufzeit', NULLIF(p->>'startdatum','')::date, NULLIF(p->>'enddatum','')::date,
      NULLIF(p->>'deadline','')::date, NULLIF(p->>'laufzeit_in_14t','')::boolean,
      NULLIF(p->>'clv','')::numeric, NULLIF(p->>'gesamt_saldo','')::numeric,
      NULLIF(p->>'ads_budget','')::numeric, NULLIF(p->>'cash_collect_offen','')::numeric,
      NULLIF(p->>'meta_kosten','')::numeric, NULLIF(p->>'crm_kosten','')::numeric,
      NULLIF(p->>'superchat_kosten','')::numeric, NULLIF(p->>'website_kosten','')::numeric
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.clients SET
      notion_id          = COALESCE(notion_id, v_notion_id),
      notion_url         = COALESCE(p->>'notion_url', notion_url),
      vor_nachname       = COALESCE(p->>'vor_nachname', vor_nachname),
      email              = COALESCE(p->>'email', email),
      phone              = COALESCE(p->>'phone', phone),
      website_url        = COALESCE(p->>'website_url', website_url),
      kundenstatus       = COALESCE(NULLIF(p->>'kundenstatus','')::kundenstatus, kundenstatus),
      ampelstatus        = COALESCE(NULLIF(p->>'ampelstatus','')::ampelstatus, ampelstatus),
      zahlstatus         = COALESCE(p->>'zahlstatus', zahlstatus),
      branche            = COALESCE(p->>'branche', branche),
      unternehmen_id     = COALESCE(NULLIF(p->>'unternehmen_id','')::uuid, unternehmen_id),
      projekttyp         = COALESCE(p->>'projekttyp', projekttyp),
      laufzeit           = COALESCE(p->>'laufzeit', laufzeit),
      startdatum         = COALESCE(NULLIF(p->>'startdatum','')::date, startdatum),
      enddatum           = COALESCE(NULLIF(p->>'enddatum','')::date, enddatum),
      deadline           = COALESCE(NULLIF(p->>'deadline','')::date, deadline),
      laufzeit_in_14t    = COALESCE(NULLIF(p->>'laufzeit_in_14t','')::boolean, laufzeit_in_14t),
      clv                = COALESCE(NULLIF(p->>'clv','')::numeric, clv),
      gesamt_saldo       = COALESCE(NULLIF(p->>'gesamt_saldo','')::numeric, gesamt_saldo),
      ads_budget         = COALESCE(NULLIF(p->>'ads_budget','')::numeric, ads_budget),
      cash_collect_offen = COALESCE(NULLIF(p->>'cash_collect_offen','')::numeric, cash_collect_offen),
      meta_kosten        = COALESCE(NULLIF(p->>'meta_kosten','')::numeric, meta_kosten),
      crm_kosten         = COALESCE(NULLIF(p->>'crm_kosten','')::numeric, crm_kosten),
      superchat_kosten   = COALESCE(NULLIF(p->>'superchat_kosten','')::numeric, superchat_kosten),
      website_kosten     = COALESCE(NULLIF(p->>'website_kosten','')::numeric, website_kosten),
      updated_at         = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;
