
CREATE TABLE public.integration_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  display_name TEXT,
  api_key TEXT,
  api_secret TEXT,
  access_token TEXT,
  refresh_token TEXT,
  webhook_url TEXT,
  config JSONB DEFAULT '{}',
  connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE TABLE public.api_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_preview TEXT NOT NULL,
  scopes JSONB DEFAULT '["read"]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT false,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.api_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id UUID REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  method TEXT,
  endpoint TEXT,
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_integrations" ON public.integration_settings
  FOR ALL USING (is_admin_or_manager(auth.uid()))
  WITH CHECK (is_admin_or_manager(auth.uid()));

CREATE POLICY "own_tokens_select" ON public.api_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "own_tokens_insert" ON public.api_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_tokens_update" ON public.api_tokens
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "own_tokens_delete" ON public.api_tokens
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "own_logs" ON public.api_logs
  FOR SELECT USING (
    token_id IN (SELECT id FROM public.api_tokens WHERE user_id = auth.uid())
  );
