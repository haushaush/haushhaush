
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1000;

CREATE TABLE public.support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_nr TEXT UNIQUE NOT NULL DEFAULT '',
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  error_type TEXT,
  error_code TEXT,
  error_message TEXT,
  error_stack TEXT,
  page_url TEXT,
  user_message TEXT NOT NULL,
  status TEXT DEFAULT 'Offen',
  priority TEXT DEFAULT 'Normal',
  slack_message_ts TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_insert" ON public.support_tickets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "admin_read_all" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own_tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admin_update" ON public.support_tickets
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.generate_ticket_nr()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.ticket_nr := 'TKT-' || LPAD(nextval('ticket_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_ticket_nr
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.generate_ticket_nr();
