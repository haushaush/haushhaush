-- Step 1: Remove orphan rows whose user_id has no matching auth.users entry
-- (these are blocking the FK creation)

delete from public.team
  where id not in (select id from auth.users);

delete from public.team_hr_data
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.user_permissions
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.user_roles
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.google_drive_connections
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.drive_connection
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.email_accounts
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.ad_creatives
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.aria_interactions
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.api_tokens
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.notifications
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.notification_settings
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.integration_settings
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.oauth_states
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.support_tickets
  where user_id is not null and user_id not in (select id from auth.users);

delete from public.time_entries
  where user_id is not null and user_id not in (select id from auth.users);

-- Anonymize orphan references in SET NULL tables before adding constraints
update public.bug_reports set user_id = null
  where user_id is not null and user_id not in (select id from auth.users);

update public.employee_requests set user_id = null
  where user_id is not null and user_id not in (select id from auth.users);
update public.employee_requests set reviewed_by = null
  where reviewed_by is not null and reviewed_by not in (select id from auth.users);

update public.kunde_meta_accounts set matched_by = null
  where matched_by is not null and matched_by not in (select id from auth.users);

update public.team_hr_data set updated_by = null
  where updated_by is not null and updated_by not in (select id from auth.users);

update public.aria_knowledge set created_by = null
  where created_by is not null and created_by not in (select id from auth.users);
update public.aria_knowledge set last_updated_by = null
  where last_updated_by is not null and last_updated_by not in (select id from auth.users);

update public.aria_memory set created_by = null
  where created_by is not null and created_by not in (select id from auth.users);

update public.aria_automations set created_by = null
  where created_by is not null and created_by not in (select id from auth.users);

update public.drive_pinned_files set pinned_by = null
  where pinned_by is not null and pinned_by not in (select id from auth.users);

update public.close_deals set assigned_to = null
  where assigned_to is not null and assigned_to not in (select id from auth.users);

update public.wiki_pages set created_by = null
  where created_by is not null and created_by not in (select id from auth.users);

-- Step 2: Add CASCADE FKs (personal data dies with the user)

alter table public.team
  drop constraint if exists team_id_fkey,
  add constraint team_id_fkey foreign key (id)
    references auth.users(id) on delete cascade;

alter table public.team_hr_data
  drop constraint if exists team_hr_data_user_id_fkey,
  add constraint team_hr_data_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.user_permissions
  drop constraint if exists user_permissions_user_id_fkey,
  add constraint user_permissions_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.user_roles
  drop constraint if exists user_roles_user_id_fkey,
  add constraint user_roles_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.google_drive_connections
  drop constraint if exists google_drive_connections_user_id_fkey,
  add constraint google_drive_connections_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.drive_connection
  drop constraint if exists drive_connection_user_id_fkey,
  add constraint drive_connection_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.email_accounts
  drop constraint if exists email_accounts_user_id_fkey,
  add constraint email_accounts_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.ad_creatives
  drop constraint if exists ad_creatives_user_id_fkey,
  add constraint ad_creatives_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.aria_interactions
  drop constraint if exists aria_interactions_user_id_fkey,
  add constraint aria_interactions_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.api_tokens
  drop constraint if exists api_tokens_user_id_fkey,
  add constraint api_tokens_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.notifications
  drop constraint if exists notifications_user_id_fkey,
  add constraint notifications_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.notification_settings
  drop constraint if exists notification_settings_user_id_fkey,
  add constraint notification_settings_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.integration_settings
  drop constraint if exists integration_settings_user_id_fkey,
  add constraint integration_settings_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.oauth_states
  drop constraint if exists oauth_states_user_id_fkey,
  add constraint oauth_states_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.support_tickets
  drop constraint if exists support_tickets_user_id_fkey,
  add constraint support_tickets_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.time_entries
  drop constraint if exists time_entries_user_id_fkey,
  add constraint time_entries_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

-- Step 3: SET NULL FKs (audit/history)

alter table public.bug_reports
  drop constraint if exists bug_reports_user_id_fkey,
  add constraint bug_reports_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete set null;

alter table public.employee_requests
  drop constraint if exists employee_requests_user_id_fkey,
  add constraint employee_requests_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete set null;

alter table public.employee_requests
  drop constraint if exists employee_requests_reviewed_by_fkey,
  add constraint employee_requests_reviewed_by_fkey foreign key (reviewed_by)
    references auth.users(id) on delete set null;

alter table public.kunde_meta_accounts
  drop constraint if exists kunde_meta_accounts_matched_by_fkey,
  add constraint kunde_meta_accounts_matched_by_fkey foreign key (matched_by)
    references auth.users(id) on delete set null;

alter table public.team_hr_data
  drop constraint if exists team_hr_data_updated_by_fkey,
  add constraint team_hr_data_updated_by_fkey foreign key (updated_by)
    references auth.users(id) on delete set null;

alter table public.aria_knowledge
  drop constraint if exists aria_knowledge_created_by_fkey,
  add constraint aria_knowledge_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete set null;

alter table public.aria_knowledge
  drop constraint if exists aria_knowledge_last_updated_by_fkey,
  add constraint aria_knowledge_last_updated_by_fkey foreign key (last_updated_by)
    references auth.users(id) on delete set null;

alter table public.aria_memory
  drop constraint if exists aria_memory_created_by_fkey,
  add constraint aria_memory_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete set null;

alter table public.aria_automations
  drop constraint if exists aria_automations_created_by_fkey,
  add constraint aria_automations_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete set null;

alter table public.drive_pinned_files
  drop constraint if exists drive_pinned_files_pinned_by_fkey,
  add constraint drive_pinned_files_pinned_by_fkey foreign key (pinned_by)
    references auth.users(id) on delete set null;

alter table public.close_deals
  drop constraint if exists close_deals_assigned_to_fkey,
  add constraint close_deals_assigned_to_fkey foreign key (assigned_to)
    references auth.users(id) on delete set null;

alter table public.wiki_pages
  drop constraint if exists wiki_pages_created_by_fkey,
  add constraint wiki_pages_created_by_fkey foreign key (created_by)
    references auth.users(id) on delete set null;
