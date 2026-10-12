create table public.close_spiegel (
  id uuid primary key default gen_random_uuid(),
  vc_lead_id text not null unique,
  hh_lead_id text,
  vc_lead_name text,
  uebernommen_am timestamptz,
  uebernommen_von uuid,
  status text not null check (status in ('gespiegelt','dublette_verknuepft','ignoriert')),
  vc_status_label text,
  letzter_abgleich timestamptz,
  created_at timestamptz not null default now()
);
alter table public.close_spiegel enable row level security;
grant select, insert, update on public.close_spiegel to authenticated;
grant all on public.close_spiegel to service_role;
create policy "spiegel read managers" on public.close_spiegel for select to authenticated using (public.bonus_can_manage());
create policy "spiegel write managers" on public.close_spiegel for all to authenticated using (public.bonus_can_manage()) with check (public.bonus_can_manage());