CREATE TABLE public.slack_list_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_list_id text NOT NULL REFERENCES public.slack_lists(slack_list_id) ON DELETE CASCADE,
  alias_type text NOT NULL CHECK (alias_type IN ('column', 'option')),
  slack_id text NOT NULL,
  parent_column_id text,
  display_name text NOT NULL,
  display_color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(slack_list_id, slack_id, parent_column_id)
);

CREATE INDEX idx_slack_aliases_list ON public.slack_list_aliases(slack_list_id);
CREATE INDEX idx_slack_aliases_type ON public.slack_list_aliases(alias_type);

ALTER TABLE public.slack_list_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read aliases"
  ON public.slack_list_aliases FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert aliases"
  ON public.slack_list_aliases FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update aliases"
  ON public.slack_list_aliases FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete aliases"
  ON public.slack_list_aliases FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER update_slack_list_aliases_updated_at
  BEFORE UPDATE ON public.slack_list_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();