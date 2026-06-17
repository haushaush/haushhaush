CREATE TABLE public.daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES public.team(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checkin', 'checkout')),
  ziele JSONB NOT NULL DEFAULT '[]'::jsonb,
  focus_task TEXT,
  zusagen JSONB NOT NULL DEFAULT '[]'::jsonb,
  energie_morgen INTEGER,
  vorfreude TEXT,
  ziele_abend JSONB NOT NULL DEFAULT '[]'::jsonb,
  zusagen_abend JSONB NOT NULL DEFAULT '[]'::jsonb,
  energie_abend INTEGER,
  learnings TEXT,
  tagesbewertung INTEGER,
  notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date, type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_checkins TO authenticated;
GRANT ALL ON public.daily_checkins TO service_role;

ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own checkins"
  ON public.daily_checkins FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins read all checkins"
  ON public.daily_checkins FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_daily_checkins_user_date ON public.daily_checkins(user_id, date DESC);
CREATE INDEX idx_daily_checkins_date ON public.daily_checkins(date DESC);

CREATE TRIGGER update_daily_checkins_updated_at
  BEFORE UPDATE ON public.daily_checkins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();