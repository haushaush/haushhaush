-- Enable scheduling extensions for the daily cron job
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ============== kunde_meta_accounts ==============
create table if not exists public.kunde_meta_accounts (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.close_deals(id) on delete cascade,
  meta_account_id text not null,
  meta_account_name text,
  match_type text not null default 'manual',
  match_confidence numeric,
  matched_at timestamptz not null default now(),
  matched_by uuid references auth.users(id),
  unique (meta_account_id)
);

create index if not exists kunde_meta_kunde_idx on public.kunde_meta_accounts(kunde_id);
create index if not exists kunde_meta_account_idx on public.kunde_meta_accounts(meta_account_id);

alter table public.kunde_meta_accounts enable row level security;

create policy "authenticated read kunde_meta"
  on public.kunde_meta_accounts for select
  to authenticated using (true);

create policy "authenticated insert kunde_meta"
  on public.kunde_meta_accounts for insert
  to authenticated with check (true);

create policy "authenticated update kunde_meta"
  on public.kunde_meta_accounts for update
  to authenticated using (true) with check (true);

create policy "authenticated delete kunde_meta"
  on public.kunde_meta_accounts for delete
  to authenticated using (true);

-- ============== pending_meta_matches ==============
create table if not exists public.pending_meta_matches (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.close_deals(id) on delete cascade,
  meta_account_id text not null,
  meta_account_name text,
  confidence numeric not null,
  reasoning text,
  source text not null default 'rule',
  created_at timestamptz not null default now(),
  unique (meta_account_id)
);

create index if not exists pending_meta_kunde_idx on public.pending_meta_matches(kunde_id);

alter table public.pending_meta_matches enable row level security;

create policy "authenticated read pending_meta"
  on public.pending_meta_matches for select
  to authenticated using (true);

create policy "authenticated insert pending_meta"
  on public.pending_meta_matches for insert
  to authenticated with check (true);

create policy "authenticated update pending_meta"
  on public.pending_meta_matches for update
  to authenticated using (true) with check (true);

create policy "authenticated delete pending_meta"
  on public.pending_meta_matches for delete
  to authenticated using (true);

-- ============== rejected_meta_matches ==============
create table if not exists public.rejected_meta_matches (
  id uuid primary key default gen_random_uuid(),
  kunde_id uuid not null references public.close_deals(id) on delete cascade,
  meta_account_id text not null,
  rejected_at timestamptz not null default now(),
  rejected_by uuid references auth.users(id),
  unique (kunde_id, meta_account_id)
);

create index if not exists rejected_meta_account_idx on public.rejected_meta_matches(meta_account_id);

alter table public.rejected_meta_matches enable row level security;

create policy "authenticated read rejected_meta"
  on public.rejected_meta_matches for select
  to authenticated using (true);

create policy "authenticated insert rejected_meta"
  on public.rejected_meta_matches for insert
  to authenticated with check (true);

create policy "authenticated delete rejected_meta"
  on public.rejected_meta_matches for delete
  to authenticated using (true);