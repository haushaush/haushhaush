CREATE OR REPLACE FUNCTION public.bonus_survey_save(_payload jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.bonus_survey_antworten; t public.bonus_survey_tokens; cid uuid; mid uuid; m date; tok text; aid uuid; v jsonb;
BEGIN
 tok:=nullif(_payload->>'token',''); cid:=(_payload->>'client_id')::uuid; mid:=(_payload->>'mitarbeiter_id')::uuid; m:=(_payload->>'monat')::date;
 IF tok IS NOT NULL THEN
  SELECT * INTO t FROM public.bonus_survey_tokens WHERE token=tok FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
  cid:=t.client_id;mid:=t.mitarbeiter_id;m:=t.monat;
 END IF;
 IF m IS NULL OR extract(day from m)<>1 THEN RAISE EXCEPTION 'Invalid month'; END IF;
 FOR v IN SELECT value FROM jsonb_each(_payload) WHERE key IN ('b1_reaktionszeit','b2_umgang','b3_verbindlichkeit','b4_eigeninitiative','l1_anfragemenge','l2_anfragequalitaet','l3_weiterempfehlung') LOOP
  IF (v::text)::integer NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid answer'; END IF;
 END LOOP;
 IF cid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(cid::text||m::text,0)); END IF;
 INSERT INTO public.bonus_survey_antworten(token,client_id,mitarbeiter_id,monat,zuordnung_status,zugeordnet_am,eingegeben_firma,eingegeben_email,kontaktname,firma,freitext,b1_reaktionszeit,b2_umgang,b3_verbindlichkeit,b4_eigeninitiative,l1_anfragemenge,l2_anfragequalitaet,l3_weiterempfehlung,score_betreuung,score_leistung)
 VALUES(tok,cid,mid,m,CASE WHEN cid IS NOT NULL THEN 'automatisch' ELSE 'offen' END,CASE WHEN cid IS NOT NULL THEN now() END,CASE WHEN tok IS NULL THEN _payload->>'eingegeben_firma' END,CASE WHEN tok IS NULL THEN _payload->>'eingegeben_email' END,_payload->>'kontaktname',_payload->>'firma',_payload->>'freitext',(_payload->>'b1_reaktionszeit')::integer,(_payload->>'b2_umgang')::integer,(_payload->>'b3_verbindlichkeit')::integer,(_payload->>'b4_eigeninitiative')::integer,(_payload->>'l1_anfragemenge')::integer,(_payload->>'l2_anfragequalitaet')::integer,(_payload->>'l3_weiterempfehlung')::integer,(_payload->>'score_betreuung')::numeric,(_payload->>'score_leistung')::numeric)
 ON CONFLICT(client_id,monat) DO UPDATE SET token=excluded.token,mitarbeiter_id=excluded.mitarbeiter_id,zuordnung_status=excluded.zuordnung_status,zugeordnet_von=NULL,zugeordnet_am=excluded.zugeordnet_am,eingegeben_firma=excluded.eingegeben_firma,eingegeben_email=excluded.eingegeben_email,kontaktname=excluded.kontaktname,firma=excluded.firma,freitext=excluded.freitext,b1_reaktionszeit=excluded.b1_reaktionszeit,b2_umgang=excluded.b2_umgang,b3_verbindlichkeit=excluded.b3_verbindlichkeit,b4_eigeninitiative=excluded.b4_eigeninitiative,l1_anfragemenge=excluded.l1_anfragemenge,l2_anfragequalitaet=excluded.l2_anfragequalitaet,l3_weiterempfehlung=excluded.l3_weiterempfehlung,score_betreuung=excluded.score_betreuung,score_leistung=excluded.score_leistung,updated_at=now()
 RETURNING id INTO aid;
 IF tok IS NOT NULL THEN UPDATE public.bonus_survey_tokens SET ausgefuellt_am=coalesce(ausgefuellt_am,now()) WHERE token=tok; END IF;
 RETURN aid;
END $$;
REVOKE ALL ON FUNCTION public.bonus_survey_save(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_survey_save(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.bonus_survey_assign(_antwort_id uuid,_client_id uuid DEFAULT NULL,_kein_kunde boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.bonus_survey_antworten; existing public.bonus_survey_antworten; mid uuid; affected uuid[];
BEGIN
 IF NOT public.bonus_can_manage() THEN RAISE EXCEPTION 'Nur Admins dürfen Einsendungen zuordnen'; END IF;
 SELECT * INTO a FROM public.bonus_survey_antworten WHERE id=_antwort_id FOR UPDATE;
 IF NOT FOUND OR a.zuordnung_status<>'offen' THEN RAISE EXCEPTION 'Einsendung ist nicht mehr offen'; END IF;
 IF _kein_kunde THEN
  UPDATE public.bonus_survey_antworten SET zuordnung_status='kein_kunde',zugeordnet_von=auth.uid(),zugeordnet_am=now(),updated_at=now() WHERE id=a.id;
  RETURN jsonb_build_object('monat',a.monat,'mitarbeiter_ids','[]'::jsonb);
 END IF;
 IF _client_id IS NULL THEN RAISE EXCEPTION 'Kunde fehlt'; END IF;
 IF (SELECT count(*) FROM public.bonus_kunden_snapshot WHERE monat=a.monat AND client_id=_client_id)<>1 THEN RAISE EXCEPTION 'Kunde muss für diesen Monat genau einem Mitarbeitersnapshot zugeordnet sein'; END IF;
 SELECT mitarbeiter_id INTO mid FROM public.bonus_kunden_snapshot WHERE monat=a.monat AND client_id=_client_id;
 PERFORM pg_advisory_xact_lock(hashtextextended(_client_id::text||a.monat::text,0));
 SELECT * INTO existing FROM public.bonus_survey_antworten WHERE client_id=_client_id AND monat=a.monat FOR UPDATE;
 IF existing.id IS NOT NULL THEN
  IF existing.updated_at>a.updated_at THEN
   DELETE FROM public.bonus_survey_antworten WHERE id=a.id;
   UPDATE public.bonus_survey_antworten SET zuordnung_status='manuell',zugeordnet_von=auth.uid(),zugeordnet_am=now() WHERE id=existing.id;
   RETURN jsonb_build_object('monat',a.monat,'mitarbeiter_ids',jsonb_build_array(mid),'neuere_einsendung_behalten',true);
  END IF;
  DELETE FROM public.bonus_survey_antworten WHERE id=existing.id;
 END IF;
 UPDATE public.bonus_survey_antworten SET client_id=_client_id,mitarbeiter_id=mid,zuordnung_status='manuell',zugeordnet_von=auth.uid(),zugeordnet_am=now() WHERE id=a.id;
 RETURN jsonb_build_object('monat',a.monat,'mitarbeiter_ids',jsonb_build_array(mid));
END $$;
REVOKE ALL ON FUNCTION public.bonus_survey_assign(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bonus_survey_assign(uuid,uuid,boolean) TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.bonus_survey_antworten FROM authenticated;
GRANT SELECT ON public.bonus_survey_antworten TO authenticated;
GRANT ALL ON public.bonus_survey_antworten TO service_role;
CREATE OR REPLACE FUNCTION public.bonus_guard_approval() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE missing jsonb;
BEGIN
 IF NEW.status='freigegeben' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
  IF NOT public.bonus_can_manage() THEN RAISE EXCEPTION 'Nur Admins dürfen Bonusmonate freigeben'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bonus_monat_freigaben WHERE monat=NEW.monat AND mitarbeiter_id=NEW.mitarbeiter_id AND churn_erfassung_abgeschlossen) THEN RAISE EXCEPTION 'Bestätigung der Churn-Erfassung ausstehend'; END IF;
  IF EXISTS(SELECT 1 FROM public.bonus_churn_events WHERE monat=NEW.monat AND mitarbeiter_id=NEW.mitarbeiter_id AND (freigabe_status='offen' OR kuendigungsdatum IS NULL OR nullif(btrim(coalesce(bemerkung,'')),'') IS NULL)) THEN RAISE EXCEPTION 'Churn-Erfassung ist unvollständig'; END IF;
  IF NEW.berechnungsdetails->>'berechnet_am' IS NULL OR (SELECT count(*) FROM jsonb_each(coalesce(NEW.berechnungsdetails->'kriterien','{}'::jsonb)))<>5 THEN RAISE EXCEPTION 'Vollständige Berechnung erforderlich'; END IF;
  IF NEW.berechnungsdetails->'kriterien'->'churn'->'wert'->>'erfassung_bestaetigt' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Churn-Bestätigung geändert, bitte erneut berechnen'; END IF;
  SELECT coalesce(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO missing FROM jsonb_each(NEW.berechnungsdetails->'kriterien') WHERE value->>'status' IS DISTINCT FROM 'ok';
  IF jsonb_array_length(missing)>0 AND (NEW.datengrundlage_bestaetigung->'kriterien' IS DISTINCT FROM missing OR NEW.datengrundlage_bestaetigung->>'berechnet_am' IS DISTINCT FROM NEW.berechnungsdetails->>'berechnet_am' OR NEW.datengrundlage_bestaetigung->>'von' IS DISTINCT FROM auth.uid()::text) THEN RAISE EXCEPTION 'Unvollständige Datengrundlage muss ausdrücklich bestätigt werden'; END IF;
  NEW.freigegeben_von:=auth.uid();NEW.freigegeben_am:=now();
 END IF;
 RETURN NEW;
END $$;