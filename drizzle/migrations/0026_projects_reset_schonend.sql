ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS verknuepfte_mitarbeiter_ids text[];

CREATE TABLE public.kunde_aenderungsprotokoll (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  feld text NOT NULL,
  alter_wert text,
  neuer_wert text,
  quelle text NOT NULL,
  quelle_projekt_id uuid,
  geaendert_von uuid,
  geaendert_am timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kunde_aenderungsprotokoll TO authenticated;
GRANT ALL ON public.kunde_aenderungsprotokoll TO service_role;
ALTER TABLE public.kunde_aenderungsprotokoll ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients viewers read protokoll" ON public.kunde_aenderungsprotokoll FOR SELECT TO authenticated
  USING (is_admin_or_manager(auth.uid()) OR user_has_permission(auth.uid(), 'clients.view'));

COMMENT ON FUNCTION public.projects_reset_execute(uuid, text, jsonb) IS 'DEPRECATED: replaced by projects_reset_run (archives only inactive/unlinked projects).';

-- Schonende Neuaufsetzung: archiviert nur Projekte inaktiver oder unverknüpfter Kunden, rettet leere Kundenfelder, ergänzt fehlende Leistungsprojekte.
-- p_dry = true liefert dieselbe Planung ohne Schreibzugriff (Vorschau).
CREATE OR REPLACE FUNCTION public.projects_reset_run(p_actor uuid, p_fingerprint text, p_plan jsonb, p_dry boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fp text; active uuid[]; item jsonb; c record; r record;
  n_unchanged int; n_archived int; n_rescued int := 0; n_created int := 0;
  details jsonb := '{}'::jsonb; key text; seen text[] := ARRAY[]::text[];
  add_detail text;
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'Nur Admins dürfen Projekte neu aufsetzen.'; END IF;
  IF jsonb_typeof(p_plan->'projects') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'active_client_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ungültige Vorschau.'; END IF;
  SELECT coalesce(array_agg(value::uuid), ARRAY[]::uuid[]) INTO active FROM jsonb_array_elements_text(p_plan->'active_client_ids');
  IF NOT p_dry THEN
    LOCK TABLE public.projects IN SHARE ROW EXCLUSIVE MODE;
    SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), '')) INTO fp FROM public.projects p;
    IF fp IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Projekte wurden seit der Vorschau geändert. Bitte Vorschau neu laden.'; END IF;
  END IF;

  CREATE TEMP TABLE _arch ON COMMIT DROP AS
    SELECT p.* FROM public.projects p WHERE p.archiviert_am IS NULL AND (p.client_id IS NULL OR NOT (p.client_id = ANY(active)));
  SELECT count(*) INTO n_archived FROM _arch;
  SELECT count(*) INTO n_unchanged FROM public.projects p WHERE p.archiviert_am IS NULL AND p.client_id = ANY(active);

  FOR r IN SELECT coalesce(client_id::text, '_ohne') k, jsonb_agg(coalesce(projektname, name) ORDER BY coalesce(projektname, name)) names FROM _arch GROUP BY 1 LOOP
    details := jsonb_set(details, ARRAY[r.k], jsonb_build_object('archived', r.names, 'rescued', '[]'::jsonb, 'created', '[]'::jsonb));
  END LOOP;

  -- Werte retten: nur leere Kundenfelder, Quelle = konkretes Projekt
  FOR c IN
    SELECT cl.id, cl.startdatum, cl.enddatum, cl.deadline, cl.laufzeit, cl.verknuepfte_mitarbeiter_ids,
      (SELECT a.id FROM _arch a WHERE a.client_id = cl.id AND a.startdatum IS NOT NULL ORDER BY a.startdatum, a.id LIMIT 1) s_id,
      (SELECT a.id FROM _arch a WHERE a.client_id = cl.id AND a.enddatum IS NOT NULL ORDER BY a.enddatum DESC, a.id LIMIT 1) e_id,
      (SELECT a.id FROM _arch a WHERE a.client_id = cl.id AND a.deadline IS NOT NULL ORDER BY a.deadline DESC, a.id LIMIT 1) d_id,
      (SELECT a.id FROM _arch a WHERE a.client_id = cl.id AND nullif(btrim(a.laufzeit), '') IS NOT NULL ORDER BY a.enddatum DESC NULLS LAST, a.created_at DESC, a.id LIMIT 1) l_id,
      (SELECT array_agg(DISTINCT m) FROM _arch a, unnest(a.verknuepfte_mitarbeiter_ids) m WHERE a.client_id = cl.id AND nullif(m, '') IS NOT NULL) m_ids,
      (SELECT a.id FROM _arch a WHERE a.client_id = cl.id AND cardinality(a.verknuepfte_mitarbeiter_ids) > 0 ORDER BY a.created_at, a.id LIMIT 1) m_src
    FROM public.clients cl WHERE cl.id IN (SELECT DISTINCT client_id FROM _arch WHERE client_id IS NOT NULL)
  LOOP
    FOR r IN
      SELECT * FROM (VALUES
        ('startdatum', c.startdatum IS NULL AND c.s_id IS NOT NULL, c.s_id, (SELECT startdatum::text FROM _arch WHERE id = c.s_id)),
        ('enddatum', c.enddatum IS NULL AND c.e_id IS NOT NULL, c.e_id, (SELECT enddatum::text FROM _arch WHERE id = c.e_id)),
        ('deadline', c.deadline IS NULL AND c.d_id IS NOT NULL, c.d_id, (SELECT deadline::text FROM _arch WHERE id = c.d_id)),
        ('laufzeit', nullif(btrim(c.laufzeit), '') IS NULL AND c.l_id IS NOT NULL, c.l_id, (SELECT laufzeit FROM _arch WHERE id = c.l_id)),
        ('mitarbeiter', coalesce(cardinality(c.verknuepfte_mitarbeiter_ids), 0) = 0 AND c.m_ids IS NOT NULL, c.m_src, array_to_string(c.m_ids, ', '))
      ) v(feld, take, src, wert) WHERE take
    LOOP
      n_rescued := n_rescued + 1;
      details := jsonb_set(details, ARRAY[c.id::text, 'rescued'], (details->c.id::text->'rescued') || jsonb_build_object('feld', r.feld, 'wert', r.wert, 'quelle', (SELECT coalesce(projektname, name) FROM _arch WHERE id = r.src)));
      IF NOT p_dry THEN
        IF r.feld = 'startdatum' THEN UPDATE public.clients SET startdatum = r.wert::date WHERE id = c.id AND startdatum IS NULL;
        ELSIF r.feld = 'enddatum' THEN UPDATE public.clients SET enddatum = r.wert::date WHERE id = c.id AND enddatum IS NULL;
        ELSIF r.feld = 'deadline' THEN UPDATE public.clients SET deadline = r.wert::date WHERE id = c.id AND deadline IS NULL;
        ELSIF r.feld = 'laufzeit' THEN UPDATE public.clients SET laufzeit = r.wert WHERE id = c.id AND nullif(btrim(laufzeit), '') IS NULL;
        ELSE UPDATE public.clients SET verknuepfte_mitarbeiter_ids = c.m_ids WHERE id = c.id AND coalesce(cardinality(verknuepfte_mitarbeiter_ids), 0) = 0;
        END IF;
        INSERT INTO public.kunde_aenderungsprotokoll (client_id, feld, alter_wert, neuer_wert, quelle, quelle_projekt_id, geaendert_von)
        VALUES (c.id, r.feld, NULL, r.wert, 'Projekte neu aufsetzen: aus archiviertem Projekt übernommen', r.src, p_actor);
      END IF;
    END LOOP;
  END LOOP;

  IF NOT p_dry THEN
    UPDATE public.projects SET archiviert_am = transaction_timestamp(), updated_at = transaction_timestamp() WHERE id IN (SELECT id FROM _arch);
  END IF;

  -- Fehlende Leistungsprojekte aktiver Kunden ergänzen (idempotent je Kunde + Leistung)
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'projects') LOOP
    IF nullif(btrim(item->>'name'), '') IS NULL OR NOT ((item->>'client_id')::uuid = ANY(active)) THEN RAISE EXCEPTION 'Projekt ohne gültige Kundenverknüpfung.'; END IF;
    key := (item->>'client_id') || '|' || lower(btrim(item->>'name'));
    IF key = ANY(seen) THEN CONTINUE; END IF;
    seen := array_append(seen, key);
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE archiviert_am IS NULL AND client_id = (item->>'client_id')::uuid AND lower(btrim(coalesce(projektname, name))) = lower(btrim(item->>'name'))) THEN
      n_created := n_created + 1;
      add_detail := item->>'client_id';
      IF NOT details ? add_detail THEN details := jsonb_set(details, ARRAY[add_detail], jsonb_build_object('archived', '[]'::jsonb, 'rescued', '[]'::jsonb, 'created', '[]'::jsonb)); END IF;
      details := jsonb_set(details, ARRAY[add_detail, 'created'], (details->add_detail->'created') || to_jsonb(item->>'name'));
      IF NOT p_dry THEN
        INSERT INTO public.projects (client_id, close_lead_id, name, projektname, projektstatus, status, projekttyp, typ, verknuepfte_kunden_ids)
        VALUES ((item->>'client_id')::uuid, item->>'close_lead_id', item->>'name', item->>'name', 'Laufzeitbetreuung', 'Aktiv', item->>'type',
          CASE WHEN nullif(item->>'type', '') IS NULL THEN NULL ELSE ARRAY[item->>'type'] END,
          CASE WHEN nullif(item->>'notion_id', '') IS NULL THEN ARRAY[]::text[] ELSE ARRAY[item->>'notion_id'] END);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('unchanged', n_unchanged, 'archived', n_archived, 'rescued', n_rescued, 'created', n_created,
    'details', (SELECT coalesce(jsonb_agg(jsonb_build_object('client_id', NULLIF(d.key, '_ohne'),
        'name', CASE WHEN d.key = '_ohne' THEN 'Ohne Kundenverknüpfung' ELSE (SELECT name FROM public.clients WHERE id::text = d.key) END,
        'aktiv', d.key <> '_ohne' AND d.key::uuid = ANY(active)) || d.value ORDER BY d.key = '_ohne', d.key), '[]'::jsonb)
      FROM jsonb_each(details) d),
    'status', 'Laufzeitbetreuung');
END;
$$;
REVOKE ALL ON FUNCTION public.projects_reset_run(uuid, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.projects_reset_run(uuid, text, jsonb, boolean) TO service_role;