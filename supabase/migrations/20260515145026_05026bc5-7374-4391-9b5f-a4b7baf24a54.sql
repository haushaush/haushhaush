
-- 1. Soft-delete + match tracking on referenz_meta_ads
ALTER TABLE public.referenz_meta_ads
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_mode TEXT CHECK (delete_mode IN ('soft','hard')),
  ADD COLUMN IF NOT EXISTS last_matched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS match_method TEXT CHECK (match_method IN ('auto_account','auto_keyword','manual','unmatched'));

CREATE INDEX IF NOT EXISTS idx_referenz_meta_ads_deleted_at ON public.referenz_meta_ads(deleted_at);
CREATE INDEX IF NOT EXISTS idx_referenz_meta_ads_match_method ON public.referenz_meta_ads(match_method);

-- 2. Blacklist table
CREATE TABLE IF NOT EXISTS public.import_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('kunde','meta_account','meta_campaign','meta_ad','keyword')),
  target_id TEXT NOT NULL,
  target_label TEXT,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, target_id)
);

CREATE INDEX IF NOT EXISTS idx_blacklist_scope_target ON public.import_blacklist(scope, target_id);

ALTER TABLE public.import_blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view blacklist" ON public.import_blacklist;
CREATE POLICY "Admins can view blacklist"
  ON public.import_blacklist FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage blacklist" ON public.import_blacklist;
CREATE POLICY "Admins can manage blacklist"
  ON public.import_blacklist FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Helper function: is an ad importable?
CREATE OR REPLACE FUNCTION public.is_importable(
  p_meta_ad_id TEXT,
  p_meta_account_id TEXT,
  p_meta_campaign_id TEXT DEFAULT NULL,
  p_kunde_id UUID DEFAULT NULL,
  p_ad_name TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked BOOLEAN;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.referenz_meta_ads
    WHERE meta_ad_id = p_meta_ad_id
      AND deleted_at IS NOT NULL
      AND delete_mode = 'hard'
  ) THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.import_blacklist
    WHERE
      (scope = 'meta_ad' AND target_id = p_meta_ad_id) OR
      (scope = 'meta_account' AND target_id = p_meta_account_id) OR
      (scope = 'meta_campaign' AND p_meta_campaign_id IS NOT NULL AND target_id = p_meta_campaign_id) OR
      (scope = 'kunde' AND p_kunde_id IS NOT NULL AND target_id = p_kunde_id::TEXT) OR
      (scope = 'keyword' AND p_ad_name IS NOT NULL AND lower(p_ad_name) LIKE '%' || lower(target_id) || '%')
  ) INTO v_blocked;

  RETURN NOT v_blocked;
END;
$$;
