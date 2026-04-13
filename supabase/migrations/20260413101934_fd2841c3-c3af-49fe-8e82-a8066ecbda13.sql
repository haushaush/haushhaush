CREATE TABLE public.creative_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  figma_node_id text UNIQUE NOT NULL,
  figma_file_key text NOT NULL DEFAULT '9JmO2Q35aHgCxmxzaKw8xi',
  name text,
  branche text,
  format text,
  typ text,
  hook_art text,
  farben jsonb,
  thumbnail_url text,
  figma_url text,
  width integer,
  height integer,
  performance_score numeric DEFAULT 0,
  analyzed boolean DEFAULT false,
  analyzed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.creative_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read creative_library" 
  ON public.creative_library FOR SELECT 
  TO authenticated
  USING (true);

CREATE POLICY "Service role manage creative_library" 
  ON public.creative_library FOR ALL 
  TO service_role
  USING (true)
  WITH CHECK (true);