import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Star, Play } from 'lucide-react';
import { ReferenzShowcaseFormModal } from '@/components/sales/ReferenzShowcaseFormModal';
import { ReferenzShowcaseDetailPanel } from '@/components/sales/ReferenzShowcaseDetailPanel';

export type ShowcaseRow = {
  id: string;
  type: 'website' | 'werbeanzeige';
  title: string;
  client_name: string | null;
  branche: string | null;
  description: string | null;
  website_url: string | null;
  preview_image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  ad_platform: string | null;
  ad_format: string | null;
  metrics: Record<string, any> | null;
  campaign_period_start: string | null;
  campaign_period_end: string | null;
  tags: string[] | null;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  linked_kunde_id: string | null;
  created_at: string;
  fallback_image_url?: string | null;
  is_iframe_blocked?: boolean | null;
  iframe_check_at?: string | null;
};

interface Props {
  type: 'website' | 'werbeanzeige';
  title: string;
}

export function ShowcaseGridPage({ type, title }: Props) {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [rows, setRows] = useState<ShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShowcaseRow | null>(null);
  const [detail, setDetail] = useState<ShowcaseRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('referenz_showcase' as any)
      .select('*')
      .eq('type', type)
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    setRows(((data ?? []) as any[]) as ShowcaseRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [type]);

  const branches = useMemo(() => Array.from(new Set(rows.map(r => r.branche).filter(Boolean))) as string[], [rows]);
  const platforms = useMemo(() => Array.from(new Set(rows.map(r => r.ad_platform).filter(Boolean))) as string[], [rows]);

  const filtered = rows.filter(r => {
    if (search && !(`${r.title} ${r.client_name ?? ''} ${r.branche ?? ''}`.toLowerCase().includes(search.toLowerCase()))) return false;
    if (brancheFilter && r.branche !== brancheFilter) return false;
    if (platformFilter && r.ad_platform !== platformFilter) return false;
    return true;
  });

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {type === 'website' ? 'Landingpages für Sales-Pitches' : 'Erfolgreiche Ad Creatives für Sales-Pitches'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Hinzufügen
          </Button>
        )}
      </header>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suchen..."
            className="pl-8 w-64"
          />
        </div>
        {branches.length > 0 && (
          <select
            value={brancheFilter}
            onChange={(e) => setBrancheFilter(e.target.value)}
            className="text-sm bg-background border border-border rounded-md px-3 h-10"
          >
            <option value="">Alle Branchen</option>
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        {type === 'werbeanzeige' && platforms.length > 0 && (
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="text-sm bg-background border border-border rounded-md px-3 h-10"
          >
            <option value="">Alle Plattformen</option>
            {platforms.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[16/10] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Noch keine Referenzen vorhanden.</p>
          {isAdmin && (
            <Button variant="outline" className="mt-4" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Erste Referenz hinzufügen
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {filtered.map(item => {
            const img = item.type === 'website' ? item.preview_image_url : item.thumbnail_url;
            const m = (item.metrics ?? {}) as Record<string, any>;
            return (
              <button
                key={item.id}
                onClick={() => setDetail(item)}
                className="group text-left bg-card border border-border rounded-lg overflow-hidden hover:border-primary/60 transition-all"
              >
                <div className="aspect-[16/10] bg-muted relative overflow-hidden">
                  {img ? (
                    <img src={img} alt={item.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">Kein Bild</div>
                  )}
                  {item.type === 'werbeanzeige' && item.video_url && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play className="w-10 h-10 text-white drop-shadow" fill="white" />
                    </div>
                  )}
                  {item.is_featured && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1">
                      <Star className="w-3 h-3" fill="currentColor" />
                    </div>
                  )}
                  {item.ad_platform && (
                    <div className="absolute top-2 right-2 bg-background/90 backdrop-blur text-[10px] uppercase font-medium rounded px-2 py-0.5">
                      {item.ad_platform}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                    {item.client_name && <span className="truncate">{item.client_name}</span>}
                    {item.branche && <><span>·</span><span className="truncate">{item.branche}</span></>}
                  </div>
                  <h3 className="text-sm font-medium truncate">{item.title}</h3>
                  {Object.keys(m).length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                      {m.leads != null && <span>{m.leads} Leads</span>}
                      {m.cpl != null && <span>{m.cpl}€ CPL</span>}
                      {m.roas != null && <span>{m.roas}x ROAS</span>}
                      {m.ctr != null && <span>{m.ctr}% CTR</span>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {formOpen && (
        <ReferenzShowcaseFormModal
          open={formOpen}
          type={type}
          editing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
        />
      )}

      {detail && (
        <ReferenzShowcaseDetailPanel
          item={detail}
          isAdmin={isAdmin}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail); setDetail(null); setFormOpen(true); }}
          onDeleted={() => { setDetail(null); load(); }}
        />
      )}
    </div>
  );
}

export function ReferenzWebsites() {
  return <ShowcaseGridPage type="website" title="Websites" />;
}

export function ReferenzWerbeanzeigen() {
  return <ShowcaseGridPage type="werbeanzeige" title="Ad Creatives" />;
}
