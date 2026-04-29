create table if not exists public.pipedrive_settings (
  id uuid primary key default gen_random_uuid(),
  api_token_encrypted text not null,
  domain text not null,
  sync_interval_minutes integer default 15,
  is_active boolean default false,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_message text,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists pipedrive_settings_active on public.pipedrive_settings(is_active) where is_active = true;

alter table public.pipedrive_settings enable row level security;

create policy "admins manage pipedrive settings" on public.pipedrive_settings
  for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create policy "service role full access pipedrive settings" on public.pipedrive_settings
  for all to service_role using (true) with check (true);

create table if not exists public.pipedrive_deals (
  id uuid primary key default gen_random_uuid(),
  pipedrive_id integer not null unique,
  title text,
  value numeric,
  currency text,
  stage_id integer,
  stage_name text,
  status text,
  person_name text,
  org_name text,
  expected_close_date date,
  raw_data jsonb,
  synced_at timestamptz default now(),
  pipedrive_updated_at timestamptz
);

create index if not exists pipedrive_deals_stage on public.pipedrive_deals(stage_id);
create index if not exists pipedrive_deals_status on public.pipedrive_deals(status);
create index if not exists pipedrive_deals_synced on public.pipedrive_deals(synced_at desc);

alter table public.pipedrive_deals enable row level security;

create policy "authenticated read deals" on public.pipedrive_deals
  for select to authenticated using (true);

create policy "service role manage deals" on public.pipedrive_deals
  for all to service_role using (true) with check (true);

create table if not exists public.pipedrive_persons (
  id uuid primary key default gen_random_uuid(),
  pipedrive_id integer not null unique,
  name text,
  email text[],
  phone text[],
  org_name text,
  raw_data jsonb,
  synced_at timestamptz default now()
);

alter table public.pipedrive_persons enable row level security;

create policy "authenticated read persons" on public.pipedrive_persons
  for select to authenticated using (true);

create policy "service role manage persons" on public.pipedrive_persons
  for all to service_role using (true) with check (true);

create table if not exists public.pipedrive_pipelines (
  id uuid primary key default gen_random_uuid(),
  pipedrive_id integer not null unique,
  name text,
  active boolean default true,
  raw_data jsonb,
  synced_at timestamptz default now()
);

alter table public.pipedrive_pipelines enable row level security;

create policy "authenticated read pipelines" on public.pipedrive_pipelines
  for select to authenticated using (true);

create policy "service role manage pipelines" on public.pipedrive_pipelines
  for all to service_role using (true) with check (true);

create table if not exists public.pipedrive_stages (
  id uuid primary key default gen_random_uuid(),
  pipedrive_id integer not null unique,
  pipeline_id integer references public.pipedrive_pipelines(pipedrive_id) on delete cascade,
  name text,
  order_nr integer,
  raw_data jsonb,
  synced_at timestamptz default now()
);

alter table public.pipedrive_stages enable row level security;

create policy "authenticated read stages" on public.pipedrive_stages
  for select to authenticated using (true);

create policy "service role manage stages" on public.pipedrive_stages
  for all to service_role using (true) with check (true);