alter table public.referenz_meta_ads
  add column if not exists thumbnail_url_meta text,
  add column if not exists thumbnail_url_persisted text,
  add column if not exists video_url text;