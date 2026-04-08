
create table if not exists public.meta_insights (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null,
  ad_account_name text,
  campaign_id text,
  campaign_name text,
  date_start date not null,
  date_stop date not null,
  spend numeric(10,2) default 0,
  impressions integer default 0,
  clicks integer default 0,
  leads integer default 0,
  cpl numeric(10,2) default 0,
  ctr numeric(6,4) default 0,
  cpm numeric(10,2) default 0,
  reach integer default 0,
  synced_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists meta_insights_account_date on public.meta_insights(ad_account_id, date_start);

alter table public.meta_insights add constraint meta_insights_unique unique (ad_account_id, campaign_id, date_start);

alter table public.meta_insights enable row level security;

create policy "Authenticated users can read meta_insights" on public.meta_insights for select to authenticated using (true);

create policy "Service role can manage meta_insights" on public.meta_insights for all to service_role using (true);
