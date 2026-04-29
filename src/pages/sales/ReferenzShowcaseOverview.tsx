import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Video } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function ReferenzShowcaseOverview() {
  const [websiteCount, setWebsiteCount] = useState<number | null>(null);
  const [adCount, setAdCount] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const [{ count: w }, { count: a }] = await Promise.all([
        supabase.from('referenz_showcase' as any).select('*', { count: 'exact', head: true }).eq('type', 'website').eq('is_active', true),
        supabase.from('referenz_showcase' as any).select('*', { count: 'exact', head: true }).eq('type', 'werbeanzeige').eq('is_active', true),
      ]);
      setWebsiteCount(w ?? 0);
      setAdCount(a ?? 0);
    })();
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Referenz Showcase</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sammlung aller bisherigen Projekte für Sales-Pitches und Calls.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/sales/referenz-showcase/websites"
          className="block bg-card border border-border hover:border-primary/60 rounded-xl p-6 transition-all"
        >
          <Globe className="w-10 h-10 text-primary mb-3" />
          <h2 className="text-lg font-semibold">Websites</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Landingpages und Funnels die wir für Kunden gebaut haben.
          </p>
          <p className="text-xs text-muted-foreground mt-3 tabular-nums">
            {websiteCount ?? '—'} Referenzen
          </p>
        </Link>

        <Link
          to="/sales/referenz-showcase/werbeanzeigen"
          className="block bg-card border border-border hover:border-primary/60 rounded-xl p-6 transition-all"
        >
          <Video className="w-10 h-10 text-primary mb-3" />
          <h2 className="text-lg font-semibold">Werbeanzeigen</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Erfolgreiche Meta-Ads, Google-Ads und Creatives.
          </p>
          <p className="text-xs text-muted-foreground mt-3 tabular-nums">
            {adCount ?? '—'} Referenzen
          </p>
        </Link>
      </div>
    </div>
  );
}
