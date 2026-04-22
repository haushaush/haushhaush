-- Google Drive OAuth connections per user
CREATE TABLE IF NOT EXISTS public.google_drive_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz
);

ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own google connection"
  ON public.google_drive_connections
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own google connection"
  ON public.google_drive_connections
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- (No insert/update policies — only edge functions with service role write here.)

-- Short-lived OAuth state tokens (for CSRF + carrying user_id through the redirect)
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'google_drive',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies — only service role accesses this table from edge functions.

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON public.oauth_states(expires_at);