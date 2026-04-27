create table if not exists public.onepage_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.onepage_projects(id) on delete set null,
  token text,
  content_type text,
  payload jsonb default '{}'::jsonb,
  raw_body text,
  user_agent text,
  status text not null default 'received',
  error text,
  received_at timestamptz not null default now()
);

create index if not exists onepage_webhook_logs_received_idx
  on public.onepage_webhook_logs(received_at desc);

create index if not exists onepage_webhook_logs_project_idx
  on public.onepage_webhook_logs(project_id, received_at desc);

create index if not exists onepage_webhook_logs_token_idx
  on public.onepage_webhook_logs(token, received_at desc);

alter table public.onepage_webhook_logs enable row level security;

drop policy if exists "Admins/managers can view webhook logs" on public.onepage_webhook_logs;
create policy "Admins/managers can view webhook logs"
  on public.onepage_webhook_logs
  for select
  to authenticated
  using (is_admin_or_manager(auth.uid()));

drop policy if exists "Admins/managers can delete webhook logs" on public.onepage_webhook_logs;
create policy "Admins/managers can delete webhook logs"
  on public.onepage_webhook_logs
  for delete
  to authenticated
  using (is_admin_or_manager(auth.uid()));