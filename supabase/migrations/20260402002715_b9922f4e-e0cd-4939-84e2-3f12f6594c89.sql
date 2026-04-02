ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS tag TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sender_avatar TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.notifications(id);

CREATE INDEX IF NOT EXISTS notifications_archived ON public.notifications(user_id, archived, read, created_at DESC);