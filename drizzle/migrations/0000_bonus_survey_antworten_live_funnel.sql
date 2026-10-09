ALTER TABLE public.bonus_survey_antworten
  ALTER COLUMN f1_reaktionszeit DROP NOT NULL,
  ALTER COLUMN f2_freundlichkeit DROP NOT NULL,
  ALTER COLUMN f3_loesungsqualitaet DROP NOT NULL,
  ALTER COLUMN f4_gesamt DROP NOT NULL;
COMMENT ON COLUMN public.bonus_survey_antworten.f1_reaktionszeit IS 'DEPRECATED: replaced by b1_reaktionszeit';
COMMENT ON COLUMN public.bonus_survey_antworten.f2_freundlichkeit IS 'DEPRECATED: replaced by b2_umgang';
COMMENT ON COLUMN public.bonus_survey_antworten.f3_loesungsqualitaet IS 'DEPRECATED: replaced by b3_verbindlichkeit';
COMMENT ON COLUMN public.bonus_survey_antworten.f4_gesamt IS 'DEPRECATED: replaced by b4_eigeninitiative';
COMMENT ON COLUMN public.bonus_survey_antworten.score IS 'DEPRECATED: replaced by score_betreuung';
ALTER TABLE public.bonus_survey_antworten
  ADD COLUMN kontaktname text CONSTRAINT bsa_kontaktname_nn CHECK (kontaktname IS NOT NULL),
  ADD COLUMN firma text,
  ADD COLUMN b1_reaktionszeit integer CONSTRAINT bsa_b1_chk CHECK (b1_reaktionszeit IS NOT NULL AND b1_reaktionszeit BETWEEN 1 AND 5),
  ADD COLUMN b2_umgang integer CONSTRAINT bsa_b2_chk CHECK (b2_umgang IS NOT NULL AND b2_umgang BETWEEN 1 AND 5),
  ADD COLUMN b3_verbindlichkeit integer CONSTRAINT bsa_b3_chk CHECK (b3_verbindlichkeit IS NOT NULL AND b3_verbindlichkeit BETWEEN 1 AND 5),
  ADD COLUMN b4_eigeninitiative integer CONSTRAINT bsa_b4_chk CHECK (b4_eigeninitiative IS NOT NULL AND b4_eigeninitiative BETWEEN 1 AND 5),
  ADD COLUMN l1_anfragemenge integer CONSTRAINT bsa_l1_chk CHECK (l1_anfragemenge IS NOT NULL AND l1_anfragemenge BETWEEN 1 AND 5),
  ADD COLUMN l2_anfragequalitaet integer CONSTRAINT bsa_l2_chk CHECK (l2_anfragequalitaet IS NOT NULL AND l2_anfragequalitaet BETWEEN 1 AND 5),
  ADD COLUMN l3_weiterempfehlung integer CONSTRAINT bsa_l3_chk CHECK (l3_weiterempfehlung IS NOT NULL AND l3_weiterempfehlung BETWEEN 1 AND 5),
  ADD COLUMN score_betreuung numeric CONSTRAINT bsa_score_betreuung_chk CHECK (score_betreuung IS NOT NULL AND score_betreuung BETWEEN 0 AND 100),
  ADD COLUMN score_leistung numeric CONSTRAINT bsa_score_leistung_chk CHECK (score_leistung IS NOT NULL AND score_leistung BETWEEN 0 AND 100);
COMMENT ON TABLE public.bonus_survey_antworten IS 'Antworten aus dem Live-Funnel leadsharks.de/zufriedenheit. Für die Bonusberechnung zählt AUSSCHLIESSLICH score_betreuung. score_leistung wird nur gespeichert/ausgewertet und darf NIEMALS in eine Punkteberechnung einfliessen (misst Kampagnen-Performance, auf die der CSM keinen Einfluss hat).';
COMMENT ON COLUMN public.bonus_survey_antworten.score_betreuung IS 'EINZIGER bonusrelevanter Score (0-100).';
COMMENT ON COLUMN public.bonus_survey_antworten.score_leistung IS 'NICHT bonusrelevant! Misst Kampagnen-Performance (Anfragemenge/-qualität), auf die der Customer Success Manager keinen Einfluss hat. Darf niemals in eine Punkteberechnung einfliessen.';