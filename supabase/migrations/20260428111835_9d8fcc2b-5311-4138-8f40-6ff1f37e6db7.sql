-- ============================================
-- shared_email_accounts: org-wide shared mailboxes
-- ============================================
CREATE TABLE IF NOT EXISTS public.shared_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address text NOT NULL UNIQUE,
  display_name text,
  provider text,

  imap_host text NOT NULL,
  imap_port integer NOT NULL DEFAULT 993,
  imap_secure boolean NOT NULL DEFAULT true,
  imap_user text NOT NULL,
  imap_password_encrypted text NOT NULL,

  smtp_host text,
  smtp_port integer DEFAULT 465,
  smtp_secure boolean DEFAULT true,
  smtp_user text,
  smtp_password_encrypted text,

  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,

  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  last_polled_at timestamptz,

  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shared_email_accounts_active_idx
  ON public.shared_email_accounts(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS shared_email_accounts_default_idx
  ON public.shared_email_accounts(is_default) WHERE is_default = true;

ALTER TABLE public.shared_email_accounts ENABLE ROW LEVEL SECURITY;

-- Admin-only via the existing has_role security-definer function (no recursion risk)
CREATE POLICY "admins read shared email accounts"
  ON public.shared_email_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins insert shared email accounts"
  ON public.shared_email_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update shared email accounts"
  ON public.shared_email_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete shared email accounts"
  ON public.shared_email_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_shared_email_accounts_updated_at
  BEFORE UPDATE ON public.shared_email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- shared_email_messages_cache
-- ============================================
CREATE TABLE IF NOT EXISTS public.shared_email_messages_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.shared_email_accounts(id) ON DELETE CASCADE,
  folder text NOT NULL,
  uid bigint NOT NULL,

  message_id text,
  from_address text,
  from_name text,
  to_addresses text[],
  cc_addresses text[],
  subject text,
  snippet text,
  date timestamptz,
  flags text[] DEFAULT '{}'::text[],
  has_attachment boolean DEFAULT false,
  size_bytes bigint,

  body_text text,
  body_html text,
  attachments jsonb,

  fetched_at timestamptz NOT NULL DEFAULT now(),
  body_fetched_at timestamptz,

  UNIQUE(account_id, folder, uid)
);

CREATE INDEX IF NOT EXISTS shared_email_cache_account_folder_idx
  ON public.shared_email_messages_cache(account_id, folder, date DESC);

ALTER TABLE public.shared_email_messages_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read shared email messages"
  ON public.shared_email_messages_cache FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins insert shared email messages"
  ON public.shared_email_messages_cache FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins update shared email messages"
  ON public.shared_email_messages_cache FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete shared email messages"
  ON public.shared_email_messages_cache FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));