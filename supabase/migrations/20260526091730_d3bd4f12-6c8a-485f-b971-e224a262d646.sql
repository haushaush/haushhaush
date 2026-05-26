
CREATE TABLE public.slack_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_list_id text UNIQUE NOT NULL,
  list_name text,
  columns jsonb,
  channel_id text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.slack_list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_item_id text UNIQUE NOT NULL,
  slack_list_id text NOT NULL REFERENCES public.slack_lists(slack_list_id) ON DELETE CASCADE,
  fields jsonb,
  date_created bigint,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slack_items_list ON public.slack_list_items(slack_list_id);

ALTER TABLE public.slack_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read slack_lists" ON public.slack_lists
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write slack_lists" ON public.slack_lists
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can read slack_list_items" ON public.slack_list_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write slack_list_items" ON public.slack_list_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
