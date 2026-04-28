create table if not exists public.email_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  trigger_type text not null default 'new_email',
  conditions jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_automation_rules enable row level security;

create policy "admins manage automation rules" on public.email_automation_rules
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "service role full access automation rules" on public.email_automation_rules
  for all to service_role using (true) with check (true);

create trigger update_email_automation_rules_updated_at
  before update on public.email_automation_rules
  for each row execute function public.update_updated_at_column();

create table if not exists public.email_automation_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid references public.email_automation_rules(id) on delete cascade,
  account_id uuid references public.shared_email_accounts(id) on delete cascade,
  message_uid bigint,
  matched_keywords text[],
  status text not null default 'pending',
  error text,
  slack_message_id text,
  executed_at timestamptz not null default now()
);

create index if not exists email_automation_executions_rule_idx 
  on public.email_automation_executions(rule_id, executed_at desc);

create unique index if not exists email_automation_executions_dedupe 
  on public.email_automation_executions(rule_id, account_id, message_uid)
  where message_uid is not null;

alter table public.email_automation_executions enable row level security;

create policy "admins read execution log" on public.email_automation_executions
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "service role full access executions" on public.email_automation_executions
  for all to service_role using (true) with check (true);

insert into public.email_automation_rules (name, enabled, conditions, action_type, action_config)
values (
  'Automatisierung Keyword → Slack Khalifa',
  true,
  '{"keyword_match": {"fields": ["subject", "body"], "keywords": ["automatisierung"], "case_sensitive": false}}'::jsonb,
  'slack_dm',
  '{"target_user": "Khalifa", "include": "full_email"}'::jsonb
);