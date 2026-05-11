import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Star, ImageIcon } from 'lucide-react';
import { AddWebsiteModal } from '@/components/sales/AddWebsiteModal';
import type { ShowcaseRow } from './ReferenzShowcaseShared';

export default function ReferenzWebsitesPage() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdmin = hasRole('admin');
  const [rows, setRows] = useState<ShowcaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brancheFilter, setBrancheFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShowcaseRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('referenz_showcase' as any)
      .select('*')
      .eq('type', 'website')
      .eq('is_active', true)
      .order('is_featured', { ascending: false })
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });
    setRows(((data ?? []) as any[]) as ShowcaseRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const branches = useMemo(
    () => Array.from(new Set(rows.map(r => r.branche).filter(Boolean))) as string[],
    [rows]
  );

  const filtered = rows.filter(r => {
    if (search && !(`${r.title} ${r.client_name ?? ''} ${r.branche ?? ''}`.toLowerCase().includes(search.toLowerCase()))) return false;
    if (brancheFilter && r.branche !== brancheFilter) return false;
    return true;
  });

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Websites</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Landingpages für Sales-Pitches – mit Live-Embedding wo möglich
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Hinzufügen
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
      </div>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[16/10] rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Noch keine Websites vorhanden.</p>
          {isAdmin && (
            <Button variant="outline" className="mt-4" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" /> Erste Website hinzufügen
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
          {filtered.map(item => {
            const m = (item.metrics ?? {}) as Record<string, any>;
            const thumb = item.thumbnail_url || item.fallback_image_url;
            return (
              <button
                key={item.id}
                onClick={() => navigate(`/sales/referenz-showcase/websites/${item.id}`)}
                className="group text-left bg-card border border-border rounded-lg overflow-hidden hover:border-primary/60 transition-all"
              >
                <div className="relative bg-muted" style={{ aspectRatio: '16/9' }}>
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={item.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[10px]">Kein Thumbnail</span>
                    </div>
                  )}
                  {item.is_featured && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full p-1 z-10">
                      <Star className="w-3 h-3" fill="currentColor" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded z-10 font-medium">
                    ⚡ Live
                  </div>
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
        <AddWebsiteModal
          open={formOpen}
          editing={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
