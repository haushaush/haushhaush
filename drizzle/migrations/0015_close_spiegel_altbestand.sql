alter table public.close_spiegel drop constraint if exists close_spiegel_status_check;
alter table public.close_spiegel add constraint close_spiegel_status_check check (status in ('gespiegelt','dublette_verknuepft','ignoriert','altbestand'));
alter table public.close_spiegel add column if not exists treffer_via text;