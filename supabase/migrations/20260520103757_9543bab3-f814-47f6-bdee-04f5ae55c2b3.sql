
ALTER TABLE public.close_opportunities ADD COLUMN IF NOT EXISTS custom_fields jsonb;

CREATE TABLE IF NOT EXISTS public.close_contacts (
  close_contact_id text PRIMARY KEY,
  close_lead_id text NOT NULL,
  client_id uuid,
  name text,
  title text,
  emails jsonb,
  phones jsonb,
  date_created timestamptz,
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_close_contacts_lead ON public.close_contacts(close_lead_id);
CREATE INDEX IF NOT EXISTS idx_close_contacts_client ON public.close_contacts(client_id);
ALTER TABLE public.close_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read close_contacts" ON public.close_contacts;
CREATE POLICY "Authenticated read close_contacts" ON public.close_contacts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin write close_contacts" ON public.close_contacts;
CREATE POLICY "Admin write close_contacts" ON public.close_contacts TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE TABLE IF NOT EXISTS public.close_tasks (
  close_task_id text PRIMARY KEY,
  close_lead_id text NOT NULL,
  client_id uuid,
  text text,
  is_complete boolean,
  due_date timestamptz,
  assigned_to text,
  date_created timestamptz,
  synced_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_close_tasks_lead ON public.close_tasks(close_lead_id);
CREATE INDEX IF NOT EXISTS idx_close_tasks_client ON public.close_tasks(client_id);
ALTER TABLE public.close_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read close_tasks" ON public.close_tasks;
CREATE POLICY "Authenticated read close_tasks" ON public.close_tasks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin write close_tasks" ON public.close_tasks;
CREATE POLICY "Admin write close_tasks" ON public.close_tasks TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));

-- Ensure close_leads also has policies (table may have been created without them earlier)
ALTER TABLE public.close_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read close_leads" ON public.close_leads;
CREATE POLICY "Authenticated read close_leads" ON public.close_leads FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin write close_leads" ON public.close_leads;
CREATE POLICY "Admin write close_leads" ON public.close_leads TO authenticated
  USING (public.is_admin_or_manager(auth.uid()))
  WITH CHECK (public.is_admin_or_manager(auth.uid()));
