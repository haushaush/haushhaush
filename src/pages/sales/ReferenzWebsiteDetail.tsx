import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowLeft, ExternalLink, RefreshCw, Pencil, Trash2, Share2, Star } from 'lucide-react';
import { WebsiteEmbed } from '@/components/sales/WebsiteEmbed';
import { AddWebsiteModal } from '@/components/sales/AddWebsiteModal';
import type { ShowcaseRow } from './ReferenzShowcaseShared';

const STALE_DAYS = 7;

export default function ReferenzWebsiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const [item, setItem] = useState<ShowcaseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('referenz_showcase' as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) toast.error('Laden fehlgeschlagen', { description: error.message });
    setItem((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Auto-refresh stale screenshots
  useEffect(() => {
    if (!item || item.embed_method !== 'screenshot' || !item.website_url) return;
    const last = item.last_embed_check_at ? new Date(item.last_embed_check_at).getTime() : 0;
    const ageMs = Date.now() - last;
    if (ageMs > STALE_DAYS * 24 * 60 * 60 * 1000) {
      refreshScreenshot(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  async function refreshScreenshot(silent = false) {
    if (!item?.website_url || !item.id) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('screenshot-website', {
        body: { url: item.website_url },
      });
      if (error) throw error;
      if (!data?.ok || !data.screenshot_url) throw new Error(data?.error || 'Kein Screenshot');
      const { error: upErr } = await supabase
        .from('referenz_showcase' as any)
        .update({
          screenshot_url: data.screenshot_url,
          last_embed_check_at: new Date().toISOString(),
        })
        .eq('id', item.id);
      if (upErr) throw upErr;
      if (!silent) toast.success('Screenshot aktualisiert');
      load();
    } catch (e: any) {
      if (!silent) toast.error('Aktualisierung fehlgeschlagen', { description: e.message });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDelete() {
    if (!item || !confirm('Diese Website wirklich löschen?')) return;
    const { error } = await supabase.from('referenz_showcase' as any).delete().eq('id', item.id);
    if (error) toast.error('Löschen fehlgeschlagen', { description: error.message });
    else { toast.success('Gelöscht'); navigate('/sales/referenz-showcase/websites'); }
  }

  async function handleShare() {
    if (!item) return;
    const url = `${window.location.origin}/showcase/${item.id}`;
    try { await navigator.clipboard.writeText(url); toast.success('Link kopiert'); }
    catch { toast.info(url); }
  }

  if (loading) {
    return <div className="p-6"><div className="h-96 rounded-lg bg-muted animate-pulse" /></div>;
  }
  if (!item) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate('/sales/referenz-showcase/websites')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Zurück
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">Website nicht gefunden.</p>
      </div>
    );
  }

  const m = (item.metrics ?? {}) as Record<string, any>;

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-5">
        <Button variant="ghost" size="sm" onClick={() => navigate('/sales/referenz-showcase/websites')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Websites
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleShare}>
            <Share2 className="w-4 h-4 mr-1.5" /> Teilen
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="w-4 h-4 mr-1.5" /> Bearbeiten
              </Button>
              <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive">
                <Trash2 className="w-4 h-4 mr-1.5" /> Löschen
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <WebsiteEmbed website={item} height={680} />
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {item.website_url && (
              <a
                href={item.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Im neuen Tab öffnen
              </a>
            )}
            {item.embed_method !== 'iframe' && (
              <button
                onClick={() => refreshScreenshot(false)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Aktualisiert…' : 'Screenshot aktualisieren'}
              </button>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto">
              Methode: <span className="font-medium">{item.embed_method ?? 'auto'}</span>
              {item.last_embed_check_at && (
                <> · zuletzt geprüft {new Date(item.last_embed_check_at).toLocaleDateString('de-DE')}</>
              )}
            </span>
          </div>
        </div>

        <aside className="space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{item.title}</h1>
              {item.is_featured && (
                <Star className="w-4 h-4 text-primary" fill="currentColor" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {[item.client_name, item.branche].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>

          {Object.keys(m).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Performance</div>
              <ul className="text-sm space-y-1 tabular-nums">
                {m.leads != null && <li>• {m.leads} Leads generiert</li>}
                {m.cpl != null && <li>• {m.cpl}€ CPL</li>}
                {m.roas != null && <li>• {m.roas}x ROAS</li>}
                {m.ctr != null && <li>• {m.ctr}% CTR</li>}
              </ul>
            </div>
          )}

          {item.description && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Beschreibung</div>
              <p className="text-sm whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(t => (
                <span key={t} className="text-[11px] bg-muted text-muted-foreground rounded px-2 py-0.5">{t}</span>
              ))}
            </div>
          )}
        </aside>
      </div>

      {editOpen && (
        <AddWebsiteModal
          open={editOpen}
          editing={item}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); load(); }}
        />
      )}
    </div>
  );
}
