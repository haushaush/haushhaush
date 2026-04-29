alter table public.referenz_showcase
  add column if not exists embed_method text default 'auto',
  add column if not exists screenshot_url text,
  add column if not exists embed_blocked boolean default false,
  add column if not exists last_embed_check_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'referenz_showcase_embed_method_check'
  ) then
    alter table public.referenz_showcase
      add constraint referenz_showcase_embed_method_check
      check (embed_method in ('auto', 'iframe', 'screenshot', 'manual'));
  end if;
end $$;