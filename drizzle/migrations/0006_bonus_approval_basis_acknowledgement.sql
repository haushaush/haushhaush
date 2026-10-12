ALTER TABLE public.bonus_monate ADD COLUMN IF NOT EXISTS datengrundlage_bestaetigung jsonb;
CREATE OR REPLACE FUNCTION public.bonus_guard_approval() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE missing jsonb;
BEGIN
 IF NEW.status = 'freigegeben' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF NOT public.bonus_can_manage() THEN RAISE EXCEPTION 'Nur Admins dürfen Bonusmonate freigeben'; END IF;
  IF NEW.berechnungsdetails->>'berechnet_am' IS NULL OR (SELECT count(*) FROM jsonb_each(COALESCE(NEW.berechnungsdetails->'kriterien','{}'::jsonb))) <> 5 THEN RAISE EXCEPTION 'Vollständige Berechnung erforderlich'; END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO missing FROM jsonb_each(NEW.berechnungsdetails->'kriterien') WHERE value->>'status' IS DISTINCT FROM 'ok';
  IF jsonb_array_length(missing)>0 AND (NEW.datengrundlage_bestaetigung->'kriterien' IS DISTINCT FROM missing OR NEW.datengrundlage_bestaetigung->>'berechnet_am' IS DISTINCT FROM NEW.berechnungsdetails->>'berechnet_am' OR NEW.datengrundlage_bestaetigung->>'von' IS DISTINCT FROM auth.uid()::text) THEN RAISE EXCEPTION 'Unvollständige Datengrundlage muss ausdrücklich bestätigt werden'; END IF;
  NEW.freigegeben_von := auth.uid(); NEW.freigegeben_am := now();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bonus_approval_guard BEFORE INSERT OR UPDATE ON public.bonus_monate FOR EACH ROW EXECUTE FUNCTION public.bonus_guard_approval();
CREATE OR REPLACE FUNCTION public.bonus_monat_freigeben(_monat date, _mitarbeiter_id uuid, _berechnet_am text, _unvollstaendig_bestaetigt boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.bonus_monate; missing jsonb;
BEGIN
 IF NOT public.bonus_can_manage() THEN RAISE EXCEPTION 'Nur Admins dürfen freigeben'; END IF;
 SELECT * INTO m FROM public.bonus_monate WHERE monat=_monat AND mitarbeiter_id=_mitarbeiter_id FOR UPDATE;
 IF NOT FOUND OR m.status <> 'offen' THEN RAISE EXCEPTION 'Kein Entwurf zur Freigabe vorhanden'; END IF;
 IF m.berechnungsdetails->>'berechnet_am' IS DISTINCT FROM _berechnet_am THEN RAISE EXCEPTION 'Berechnung geändert, bitte erneut prüfen'; END IF;
 SELECT COALESCE(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO missing FROM jsonb_each(COALESCE(m.berechnungsdetails->'kriterien','{}'::jsonb)) WHERE value->>'status' IS DISTINCT FROM 'ok';
 IF jsonb_array_length(missing)>0 AND NOT _unvollstaendig_bestaetigt THEN RAISE EXCEPTION 'Unvollständige Datengrundlage muss ausdrücklich bestätigt werden'; END IF;
 UPDATE public.bonus_monate SET status='freigegeben', datengrundlage_bestaetigung=CASE WHEN jsonb_array_length(missing)>0 THEN jsonb_build_object('kriterien',missing,'berechnet_am',_berechnet_am,'von',auth.uid(),'am',now()) ELSE NULL END WHERE monat=_monat AND mitarbeiter_id=_mitarbeiter_id;
END $$;
REVOKE ALL ON FUNCTION public.bonus_monat_freigeben(date,uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_monat_freigeben(date,uuid,text,boolean) TO authenticated;