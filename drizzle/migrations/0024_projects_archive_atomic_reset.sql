ALTER TABLE public.projects ADD COLUMN archiviert_am timestamptz, ADD COLUMN close_lead_id text;
CREATE INDEX projects_active_client_name_idx ON public.projects (client_id, lower(btrim(name))) WHERE archiviert_am IS NULL;
COMMENT ON COLUMN public.projects.archiviert_am IS 'Archived projects stay linked to all historical records; null means visible in operational views.';

CREATE OR REPLACE FUNCTION public.projects_reset_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('fingerprint', md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), '')), 'projects', coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id), '[]'::jsonb)) FROM public.projects p;
$$;
REVOKE ALL ON FUNCTION public.projects_reset_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.projects_reset_snapshot() TO service_role;

CREATE OR REPLACE FUNCTION public.projects_reset_execute(p_actor uuid, p_fingerprint text, p_plan jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_fingerprint text; archived_count integer; new_count integer := 0; kept_count integer := 0; item jsonb; keep_id uuid; keep_ids uuid[] := ARRAY[]::uuid[]; desired_key text; seen_keys text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.has_role(p_actor, 'admin') THEN RAISE EXCEPTION 'Nur Admins dürfen Projekte neu aufsetzen.'; END IF;
  IF jsonb_typeof(p_plan->'projects') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'customers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Ungültige Vorschau.'; END IF;
  LOCK TABLE public.projects IN SHARE ROW EXCLUSIVE MODE;
  SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '|' ORDER BY p.id), '')) INTO current_fingerprint FROM public.projects p;
  IF current_fingerprint IS DISTINCT FROM p_fingerprint THEN RAISE EXCEPTION 'Projekte wurden seit der Vorschau geändert. Bitte Vorschau neu laden.'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'projects') LOOP
    IF nullif(btrim(item->>'name'), '') IS NULL OR nullif(item->>'close_lead_id', '') IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = (item->>'client_id')::uuid) THEN RAISE EXCEPTION 'Projekt ohne gültige Kundenverknüpfung.'; END IF;
    desired_key := (item->>'client_id') || '|' || lower(btrim(item->>'name'));
    IF desired_key = ANY(seen_keys) THEN RAISE EXCEPTION 'Doppelte Leistung in Vorschau.'; END IF;
    seen_keys := array_append(seen_keys, desired_key);
    SELECT id INTO keep_id FROM public.projects WHERE archiviert_am IS NULL AND client_id = (item->>'client_id')::uuid AND lower(btrim(coalesce(projektname, name))) = lower(btrim(item->>'name')) ORDER BY created_at, id LIMIT 1;
    IF keep_id IS NOT NULL THEN keep_ids := array_append(keep_ids, keep_id); kept_count := kept_count + 1; END IF;
  END LOOP;
  UPDATE public.projects SET archiviert_am = transaction_timestamp(), updated_at = transaction_timestamp() WHERE archiviert_am IS NULL AND NOT (id = ANY(keep_ids));
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'projects') LOOP
    IF NOT EXISTS (SELECT 1 FROM public.projects WHERE archiviert_am IS NULL AND client_id = (item->>'client_id')::uuid AND lower(btrim(coalesce(projektname, name))) = lower(btrim(item->>'name'))) THEN
      INSERT INTO public.projects (client_id, close_lead_id, name, projektname, projektstatus, status, projekttyp, typ, verknuepfte_kunden_ids)
      VALUES ((item->>'client_id')::uuid, item->>'close_lead_id', item->>'name', item->>'name', 'Laufzeitbetreuung', 'Aktiv', item->>'type', CASE WHEN nullif(item->>'type', '') IS NULL THEN NULL ELSE ARRAY[item->>'type'] END, CASE WHEN nullif(item->>'notion_id', '') IS NULL THEN ARRAY[]::text[] ELSE ARRAY[item->>'notion_id'] END);
      new_count := new_count + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('archived', archived_count, 'created', new_count, 'kept', kept_count, 'active_customers', jsonb_array_length(p_plan->'customers'), 'customers', p_plan->'customers', 'without_services', p_plan->'without_services', 'status', 'Laufzeitbetreuung');
END;
$$;
REVOKE ALL ON FUNCTION public.projects_reset_execute(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.projects_reset_execute(uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.projects_restore(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Nur Admins dürfen Projekte wiederherstellen.'; END IF;
  UPDATE public.projects SET archiviert_am = NULL, updated_at = transaction_timestamp() WHERE id = p_project_id AND archiviert_am IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Archiviertes Projekt nicht gefunden.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.projects_restore(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.projects_restore(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.projects_guard_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user = 'postgres' AND auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.archiviert_am IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.archiviert_am IS DISTINCT FROM OLD.archiviert_am) THEN
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Nur Admins dürfen den Archivstatus ändern.'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER projects_guard_archive BEFORE INSERT OR UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.projects_guard_archive();