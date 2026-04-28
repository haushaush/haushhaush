-- Trusted devices: store hashed device tokens (so leaked DB still doesn't bypass MFA)
create table if not exists public.mfa_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_token_hash text not null,
  device_name text,
  user_agent text,
  ip_address text,
  trusted_until timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mfa_trusted_devices_user_idx on public.mfa_trusted_devices(user_id);
create index if not exists mfa_trusted_devices_expiry_idx on public.mfa_trusted_devices(trusted_until);

alter table public.mfa_trusted_devices enable row level security;

drop policy if exists "users own trusted devices select" on public.mfa_trusted_devices;
drop policy if exists "users own trusted devices insert" on public.mfa_trusted_devices;
drop policy if exists "users own trusted devices delete" on public.mfa_trusted_devices;

create policy "users own trusted devices select"
  on public.mfa_trusted_devices for select to authenticated
  using (auth.uid() = user_id);

create policy "users own trusted devices insert"
  on public.mfa_trusted_devices for insert to authenticated
  with check (auth.uid() = user_id);

create policy "users own trusted devices delete"
  on public.mfa_trusted_devices for delete to authenticated
  using (auth.uid() = user_id);

-- Recovery codes: hashed (sha256), single-use
create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mfa_recovery_codes_user_idx on public.mfa_recovery_codes(user_id);

alter table public.mfa_recovery_codes enable row level security;

drop policy if exists "users view own recovery codes" on public.mfa_recovery_codes;
create policy "users view own recovery codes"
  on public.mfa_recovery_codes for select to authenticated
  using (auth.uid() = user_id);

-- Track MFA enrollment timestamp on a per-user basis (separate from auth.users)
create table if not exists public.user_mfa_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mfa_enrolled_at timestamptz,
  last_enrolled_factor_id text,
  updated_at timestamptz not null default now()
);

alter table public.user_mfa_status enable row level security;

drop policy if exists "users manage own mfa status" on public.user_mfa_status;
create policy "users manage own mfa status"
  on public.user_mfa_status for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
