-- 1. Drop the old single-row table (and any referencing data — none yet in production)
drop table if exists public.pipedrive_settings cascade;

-- 2. Create the multi-account table
create table if not exists public.pipedrive_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null,
  api_token_encrypted text not null,
  linked_kunde_id uuid references public.close_deals(id) on delete set null,
  pipedrive_user_id integer,
  pipedrive_user_name text,
  pipedrive_user_email text,
  pipedrive_company_name text,
  sync_interval_minutes integer default 15,
  is_active boolean default true,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_message text,
  total_deals_synced integer default 0,
  total_persons_synced integer default 0,
  color_hex text default '#0EA5E9',
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists pipedrive_accounts_domain on public.pipedrive_accounts(domain);
create index if not exists pipedrive_accounts_active on public.pipedrive_accounts(is_active);
create index if not exists pipedrive_accounts_kunde on public.pipedrive_accounts(linked_kunde_id);

alter table public.pipedrive_accounts enable row level security;

create policy "admins manage pipedrive accounts" on public.pipedrive_accounts
  for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "service role full access pipedrive accounts" on public.pipedrive_accounts
  for all to service_role using (true) with check (true);

-- 3. Add account_id to existing sync tables
alter table public.pipedrive_deals
  add column if not exists account_id uuid references public.pipedrive_accounts(id) on delete cascade;
alter table public.pipedrive_persons
  add column if not exists account_id uuid references public.pipedrive_accounts(id) on delete cascade;
alter table public.pipedrive_pipelines
  add column if not exists account_id uuid references public.pipedrive_accounts(id) on delete cascade;
alter table public.pipedrive_stages
  add column if not exists account_id uuid references public.pipedrive_accounts(id) on delete cascade;

create index if not exists pipedrive_deals_account on public.pipedrive_deals(account_id);
create index if not exists pipedrive_persons_account on public.pipedrive_persons(account_id);
create index if not exists pipedrive_pipelines_account on public.pipedrive_pipelines(account_id);
create index if not exists pipedrive_stages_account on public.pipedrive_stages(account_id);

-- 4. Replace global unique constraint on pipedrive_id with per-account uniqueness
alter table public.pipedrive_deals
  drop constraint if exists pipedrive_deals_pipedrive_id_key;
alter table public.pipedrive_deals
  add constraint pipedrive_deals_account_pipedrive_unique unique(account_id, pipedrive_id);

alter table public.pipedrive_persons
  drop constraint if exists pipedrive_persons_pipedrive_id_key;
alter table public.pipedrive_persons
  add constraint pipedrive_persons_account_pipedrive_unique unique(account_id, pipedrive_id);

-- pipedrive_pipelines is referenced by pipedrive_stages.pipeline_id (FK to pipedrive_id).
-- Drop that FK first so we can drop the unique constraint on pipedrive_id.
alter table public.pipedrive_stages
  drop constraint if exists pipedrive_stages_pipeline_id_fkey;

alter table public.pipedrive_pipelines
  drop constraint if exists pipedrive_pipelines_pipedrive_id_key;
alter table public.pipedrive_pipelines
  add constraint pipedrive_pipelines_account_pipedrive_unique unique(account_id, pipedrive_id);

alter table public.pipedrive_stages
  drop constraint if exists pipedrive_stages_pipedrive_id_key;
alter table public.pipedrive_stages
  add constraint pipedrive_stages_account_pipedrive_unique unique(account_id, pipedrive_id);

-- updated_at trigger for pipedrive_accounts
drop trigger if exists pipedrive_accounts_updated_at on public.pipedrive_accounts;
create trigger pipedrive_accounts_updated_at
  before update on public.pipedrive_accounts
  for each row execute function public.update_updated_at_column();