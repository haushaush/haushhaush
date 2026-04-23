-- Enable pgcrypto for password encryption (installed in extensions schema in Supabase)
create extension if not exists pgcrypto with schema extensions;

-- Email accounts with encrypted IMAP/SMTP credentials
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  email_address text not null,
  display_name text,
  provider text,

  imap_host text not null,
  imap_port integer not null default 993,
  imap_secure boolean not null default true,
  imap_user text not null,
  imap_password_encrypted text not null,

  smtp_host text,
  smtp_port integer default 465,
  smtp_secure boolean default true,

  is_active boolean not null default true,
  is_default boolean not null default false,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  last_polled_at timestamptz,
  last_user_activity_at timestamptz default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, email_address)
);

alter table public.email_accounts enable row level security;

create policy "own email accounts select"
  on public.email_accounts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "own email accounts insert"
  on public.email_accounts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "own email accounts update"
  on public.email_accounts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own email accounts delete"
  on public.email_accounts for delete
  to authenticated
  using (auth.uid() = user_id);

create trigger email_accounts_updated_at
  before update on public.email_accounts
  for each row execute function public.update_updated_at_column();

-- Cached IMAP messages
create table public.email_messages_cache (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.email_accounts(id) on delete cascade,
  folder text not null,
  uid bigint not null,

  message_id text,
  from_address text,
  from_name text,
  to_addresses text[],
  cc_addresses text[],
  subject text,
  snippet text,
  date timestamptz,
  flags text[] default '{}',
  has_attachment boolean default false,
  size_bytes bigint,

  body_text text,
  body_html text,
  attachments jsonb,

  fetched_at timestamptz not null default now(),
  body_fetched_at timestamptz,

  unique (account_id, folder, uid)
);

create index email_messages_account_folder_idx
  on public.email_messages_cache (account_id, folder, date desc);

create index email_messages_unread_idx
  on public.email_messages_cache (account_id, folder)
  where not ('\Seen' = any(flags));

alter table public.email_messages_cache enable row level security;

create policy "own messages select"
  on public.email_messages_cache for select
  to authenticated
  using (
    exists (
      select 1 from public.email_accounts a
      where a.id = email_messages_cache.account_id
        and a.user_id = auth.uid()
    )
  );

create policy "own messages insert"
  on public.email_messages_cache for insert
  to authenticated
  with check (
    exists (
      select 1 from public.email_accounts a
      where a.id = email_messages_cache.account_id
        and a.user_id = auth.uid()
    )
  );

create policy "own messages update"
  on public.email_messages_cache for update
  to authenticated
  using (
    exists (
      select 1 from public.email_accounts a
      where a.id = email_messages_cache.account_id
        and a.user_id = auth.uid()
    )
  );

create policy "own messages delete"
  on public.email_messages_cache for delete
  to authenticated
  using (
    exists (
      select 1 from public.email_accounts a
      where a.id = email_messages_cache.account_id
        and a.user_id = auth.uid()
    )
  );

-- Encrypt / decrypt helpers (key passed by edge function each call)
create or replace function public.encrypt_imap_password(password text, encryption_key text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select encode(
    extensions.pgp_sym_encrypt(password, encryption_key),
    'base64'
  );
$$;

create or replace function public.decrypt_imap_password(encrypted text, encryption_key text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.pgp_sym_decrypt(
    decode(encrypted, 'base64'),
    encryption_key
  );
$$;

revoke execute on function public.encrypt_imap_password(text, text) from public, anon, authenticated;
revoke execute on function public.decrypt_imap_password(text, text) from public, anon, authenticated;
grant execute on function public.encrypt_imap_password(text, text) to service_role;
grant execute on function public.decrypt_imap_password(text, text) to service_role;