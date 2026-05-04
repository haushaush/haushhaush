
CREATE TABLE public.pending_close_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kunde_id uuid NOT NULL REFERENCES public.close_deals(id) ON DELETE CASCADE,
  close_lead_id text NOT NULL,
  close_lead_name text,
  match_confidence numeric NOT NULL,
  match_reason text,
  match_type text,
  ai_reasoning text,
  status text DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  UNIQUE(kunde_id, close_lead_id)
);

CREATE INDEX pending_close_matches_status ON public.pending_close_matches(status, match_confidence DESC);

ALTER TABLE public.pending_close_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage pending close matches"
  ON public.pending_close_matches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add validation trigger instead of CHECK constraint for status
CREATE OR REPLACE FUNCTION public.validate_pending_close_match_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_pending_close_match_status_trigger
  BEFORE INSERT OR UPDATE ON public.pending_close_matches
  FOR EACH ROW EXECUTE FUNCTION public.validate_pending_close_match_status();
