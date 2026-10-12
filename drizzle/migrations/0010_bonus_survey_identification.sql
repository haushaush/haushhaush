ALTER TABLE public.bonus_survey_antworten ALTER COLUMN token DROP NOT NULL;
ALTER TABLE public.bonus_survey_antworten ADD COLUMN eingegeben_firma text, ADD COLUMN eingegeben_email text, ADD COLUMN zuordnung_status text NOT NULL DEFAULT 'offen', ADD COLUMN zugeordnet_von uuid, ADD COLUMN zugeordnet_am timestamptz, ADD COLUMN client_id uuid REFERENCES public.clients(id), ADD COLUMN mitarbeiter_id uuid REFERENCES public.bonus_mitarbeiter(id), ADD COLUMN monat date DEFAULT date_trunc('month',now() AT TIME ZONE 'Europe/Berlin')::date, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.bonus_survey_antworten a SET client_id=t.client_id,mitarbeiter_id=t.mitarbeiter_id,monat=t.monat,zuordnung_status='automatisch',zugeordnet_am=a.created_at FROM public.bonus_survey_tokens t WHERE t.token=a.token;
ALTER TABLE public.bonus_survey_antworten ADD CONSTRAINT bonus_survey_assignment_status CHECK (zuordnung_status IN ('automatisch','manuell','offen','kein_kunde'));
CREATE UNIQUE INDEX bonus_survey_customer_month ON public.bonus_survey_antworten(client_id,monat);
DROP POLICY bonus_survey_antworten_select ON public.bonus_survey_antworten;
CREATE POLICY bonus_survey_antworten_select ON public.bonus_survey_antworten FOR SELECT TO authenticated USING (public.bonus_can_manage() OR public.bonus_is_own(mitarbeiter_id));
CREATE TABLE public.bonus_survey_rate_limits(ip_hash text PRIMARY KEY, accepted_at timestamptz[] NOT NULL DEFAULT '{}');
GRANT ALL ON public.bonus_survey_rate_limits TO service_role;
ALTER TABLE public.bonus_survey_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.bonus_survey_rate_allow(_ip_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE hits timestamptz[];
BEGIN
 IF length(_ip_hash)<>64 THEN RAISE EXCEPTION 'Invalid hash'; END IF;
 INSERT INTO public.bonus_survey_rate_limits(ip_hash) VALUES(_ip_hash) ON CONFLICT DO NOTHING;
 SELECT accepted_at INTO hits FROM public.bonus_survey_rate_limits WHERE ip_hash=_ip_hash FOR UPDATE;
 SELECT coalesce(array_agg(t),'{}'::timestamptz[]) INTO hits FROM unnest(hits) t WHERE t>clock_timestamp()-interval '1 hour';
 IF cardinality(hits)>=5 THEN RETURN false; END IF;
 UPDATE public.bonus_survey_rate_limits SET accepted_at=array_append(hits,clock_timestamp()) WHERE ip_hash=_ip_hash;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bonus_survey_rate_allow(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_survey_rate_allow(text) TO service_role;