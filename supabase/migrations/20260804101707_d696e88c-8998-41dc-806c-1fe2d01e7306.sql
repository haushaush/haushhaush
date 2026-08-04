DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'bonus\_%'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;