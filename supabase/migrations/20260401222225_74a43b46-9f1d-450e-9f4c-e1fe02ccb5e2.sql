
-- Add ad_performance_kunden table (mirrors ad_performance_intern)
CREATE TABLE IF NOT EXISTS public.ad_performance_kunden (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  datum date NOT NULL DEFAULT CURRENT_DATE,
  spend numeric DEFAULT 0,
  leads integer DEFAULT 0,
  cpl numeric DEFAULT 0,
  appointments integer DEFAULT 0,
  cost_per_appointment numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_performance_kunden ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ad_performance_kunden"
  ON public.ad_performance_kunden FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and managers can insert ad_performance_kunden"
  ON public.ad_performance_kunden FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins and managers can update ad_performance_kunden"
  ON public.ad_performance_kunden FOR UPDATE TO authenticated
  USING (is_admin_or_manager(auth.uid()));

CREATE POLICY "Admins can delete ad_performance_kunden"
  ON public.ad_performance_kunden FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
