CREATE TABLE public.ad_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kunde text,
  branche text,
  format text,
  platform text,
  zielgruppe text,
  produkt text,
  hook_type text,
  headline text,
  body_copy text,
  cta text,
  figma_url text,
  thumbnail_url text,
  reference_frame_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own creatives" ON public.ad_creatives FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own creatives" ON public.ad_creatives FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own creatives" ON public.ad_creatives FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own creatives" ON public.ad_creatives FOR DELETE USING (auth.uid() = user_id);