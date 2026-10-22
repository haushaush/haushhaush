ALTER TABLE public.bonus_survey_antworten ADD COLUMN IF NOT EXISTS zuordnung_grund text, ADD COLUMN IF NOT EXISTS zuordnung_kandidaten uuid[];
COMMENT ON COLUMN public.bonus_survey_antworten.zuordnung_grund IS 'Automatic matching reason: email / name / name+firma / mehrdeutig / kein_treffer';
CREATE OR REPLACE FUNCTION public.bonus_survey_save(_payload jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t public.bonus_survey_tokens; cid uuid; mid uuid; m date; tok text; aid uuid; v jsonb; grund text; kand uuid[];
BEGIN
 tok:=nullif(_payload->>'token',''); cid:=(_payload->>'client_id')::uuid; mid:=(_payload->>'mitarbeiter_id')::uuid; m:=(_payload->>'monat')::date;
 grund:=nullif(_payload->>'zuordnung_grund','');
 IF grund IS NOT NULL AND grund NOT IN ('email','name','name+firma','mehrdeutig','kein_treffer') THEN RAISE EXCEPTION 'Invalid reason'; END IF;
 IF jsonb_typeof(_payload->'zuordnung_kandidaten')='array' THEN SELECT array_agg(x::uuid) INTO kand FROM jsonb_array_elements_text(_payload->'zuordnung_kandidaten') x; END IF;
 IF tok IS NOT NULL THEN
  SELECT * INTO t FROM public.bonus_survey_tokens WHERE token=tok FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
  cid:=t.client_id;mid:=t.mitarbeiter_id;m:=t.monat; grund:=NULL; kand:=NULL;
 END IF;
 IF m IS NULL OR extract(day from m)<>1 THEN RAISE EXCEPTION 'Invalid month'; END IF;
 FOR v IN SELECT value FROM jsonb_each(_payload) WHERE key IN ('b1_reaktionszeit','b2_umgang','b3_verbindlichkeit','b4_eigeninitiative','l1_anfragemenge','l2_anfragequalitaet','l3_weiterempfehlung') LOOP
  IF (v::text)::integer NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid answer'; END IF;
 END LOOP;
 IF cid IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(cid::text||m::text,0)); END IF;
 INSERT INTO public.bonus_survey_antworten(token,client_id,mitarbeiter_id,monat,zuordnung_status,zugeordnet_am,eingegeben_firma,eingegeben_email,kontaktname,firma,freitext,b1_reaktionszeit,b2_umgang,b3_verbindlichkeit,b4_eigeninitiative,l1_anfragemenge,l2_anfragequalitaet,l3_weiterempfehlung,score_betreuung,score_leistung,zuordnung_grund,zuordnung_kandidaten)
 VALUES(tok,cid,mid,m,CASE WHEN cid IS NOT NULL THEN 'automatisch' ELSE 'offen' END,CASE WHEN cid IS NOT NULL THEN now() END,CASE WHEN tok IS NULL THEN _payload->>'eingegeben_firma' END,CASE WHEN tok IS NULL THEN _payload->>'eingegeben_email' END,_payload->>'kontaktname',_payload->>'firma',_payload->>'freitext',(_payload->>'b1_reaktionszeit')::integer,(_payload->>'b2_umgang')::integer,(_payload->>'b3_verbindlichkeit')::integer,(_payload->>'b4_eigeninitiative')::integer,(_payload->>'l1_anfragemenge')::integer,(_payload->>'l2_anfragequalitaet')::integer,(_payload->>'l3_weiterempfehlung')::integer,(_payload->>'score_betreuung')::numeric,(_payload->>'score_leistung')::numeric,grund,kand)
 ON CONFLICT(client_id,monat) DO UPDATE SET token=excluded.token,mitarbeiter_id=excluded.mitarbeiter_id,zuordnung_status=excluded.zuordnung_status,zugeordnet_von=NULL,zugeordnet_am=excluded.zugeordnet_am,eingegeben_firma=excluded.eingegeben_firma,eingegeben_email=excluded.eingegeben_email,kontaktname=excluded.kontaktname,firma=excluded.firma,freitext=excluded.freitext,b1_reaktionszeit=excluded.b1_reaktionszeit,b2_umgang=excluded.b2_umgang,b3_verbindlichkeit=excluded.b3_verbindlichkeit,b4_eigeninitiative=excluded.b4_eigeninitiative,l1_anfragemenge=excluded.l1_anfragemenge,l2_anfragequalitaet=excluded.l2_anfragequalitaet,l3_weiterempfehlung=excluded.l3_weiterempfehlung,score_betreuung=excluded.score_betreuung,score_leistung=excluded.score_leistung,zuordnung_grund=excluded.zuordnung_grund,zuordnung_kandidaten=excluded.zuordnung_kandidaten,updated_at=now()
 RETURNING id INTO aid;
 IF tok IS NOT NULL THEN UPDATE public.bonus_survey_tokens SET ausgefuellt_am=coalesce(ausgefuellt_am,now()) WHERE token=tok; END IF;
 RETURN aid;
END $function$;