import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { ShowcaseRow } from './sales/ReferenzShowcaseShared';

export default function PublicShowcaseView() {
  const { id } = useParams();
  const [item, setItem] = useState<ShowcaseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('referenz_showcase' as any)
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
      if (error || !data) setNotFound(true);
      else setItem(data as any);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Lädt…</div>;
  if (notFound || !item) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Referenz nicht gefunden.</div>;

  const m = (item.metrics ?? {}) as Record<string, any>;
  const img = item.type === 'website' ? item.preview_image_url : item.thumbnail_url;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{item.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {[item.client_name, item.branche, item.ad_platform].filter(Boolean).join(' · ')}
          </p>
        </header>

        <div className="aspect-[16/9] bg-muted rounded-xl overflow-hidden mb-6">
          {item.type === 'werbeanzeige' && item.video_url ? (
            <video src={item.video_url} controls poster={item.thumbnail_url ?? undefined} className="w-full h-full object-contain bg-black" />
          ) : img ? (
            <img src={img} alt={item.title} className="w-full h-full object-cover" />
          ) : null}
        </div>

        {item.description && <p className="text-base whitespace-pre-wrap mb-6">{item.description}</p>}

        {Object.keys(m).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {m.leads != null && <Stat label="Leads" value={m.leads} />}
            {m.cpl != null && <Stat label="CPL" value={`${m.cpl}€`} />}
            {m.roas != null && <Stat label="ROAS" value={`${m.roas}x`} />}
            {m.ctr != null && <Stat label="CTR" value={`${m.ctr}%`} />}
          </div>
        )}

        {item.website_url && (
          <a href={item.website_url} target="_blank" rel="noopener noreferrer"
             className="inline-block text-primary hover:underline">{item.website_url}</a>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
