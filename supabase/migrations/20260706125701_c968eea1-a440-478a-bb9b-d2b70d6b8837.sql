
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store the cron secret in Supabase Vault (idempotent).
DO $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM vault.secrets WHERE name = 'qonto_cron_secret';
  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(36), 'base64'), 'qonto_cron_secret', 'Secret used by pg_cron to authenticate against sync-qonto edge function');
  END IF;
END $$;

-- Helper: verify a provided secret against the vault-stored value.
CREATE OR REPLACE FUNCTION public.verify_qonto_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'qonto_cron_secret' AND decrypted_secret = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.verify_qonto_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_qonto_cron_secret(text) TO service_role;
