
CREATE TABLE public.aria_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('user_preference', 'correction', 'fact', 'workflow', 'feedback')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 1.0,
  times_confirmed INTEGER DEFAULT 1,
  times_contradicted INTEGER DEFAULT 0,
  created_by UUID,
  last_reinforced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.aria_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_message TEXT NOT NULL,
  aria_response TEXT NOT NULL,
  actions_executed JSONB DEFAULT '[]',
  feedback INTEGER CHECK (feedback IN (-1, 0, 1)),
  feedback_note TEXT,
  session_context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aria_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aria_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_memory" ON public.aria_memory FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "own_interactions_select" ON public.aria_interactions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_interactions_insert" ON public.aria_interactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_interactions_update" ON public.aria_interactions FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own_interactions_delete" ON public.aria_interactions FOR DELETE TO authenticated USING (user_id = auth.uid());
