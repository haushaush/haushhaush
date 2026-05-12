import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPublicView } from '@/hooks/useIsPublicView';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  Share2,
  Pencil,
  Trash2,
  Tag,
  Calendar,
  Building2,
  Briefcase,
  RefreshCw,
} from 'lucide-react';
import { WebsiteEmbed } from '@/components/sales/WebsiteEmbed';
import { AddWebsiteModal } from '@/components/sales/AddWebsiteModal';
import type { ShowcaseRow } from './ReferenzShowcaseShared';

export default function ReferenzWebsiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const isPublic = useIsPublicView();
  const isAdmin = hasRole('admin') && !isPublic;
  const [item, setItem] = useState<ShowcaseRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('referenz_showcase' as any)
      .select(isPublic ? '*' : '*, linked_kunde:close_deals(id, client_name, unternehmen, branche)')
      .eq('id', id)
      .maybeSingle();
    if (error) toast.error('Laden fehlgeschlagen', { description: error.message });
    setItem((data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  async function handleDelete() {
    if (!item || !confirm('Diese Website wirklich löschen?')) return;
    const { error } = await supabase.from('referenz_showcase' as any).delete().eq('id', item.id);
    if (error) toast.error('Löschen fehlgeschlagen', { description: error.message });
    else {
      toast.success('Gelöscht');
      navigate(`${isPublic ? '/showcase' : '/sales/referenz-showcase'}/websites`);
    }
  }

  async function handleShare() {
    if (!item) return;
    const url = `${window.location.origin}/showcase/${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Teilen-Link kopiert');
    } catch {
      toast.info(url);
    }
  }

  async function handleCopyUrl() {
    if (!item?.website_url) return;
    try {
      await navigator.clipboard.writeText(item.website_url);
      toast.success('Link kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  }

  async function handleRecheck() {
    if (!item?.website_url) return;
    const promise = supabase.functions
      .invoke('check-website-embeddable', {
        body: { showcase_id: item.id, url: item.website_url },
      })
      .then(({ data, error }) => {
        if (error) throw error;
        load();
        return data;
      });
    toast.promise(promise, {
      loading: 'Prüfe Embed-Status…',
      success: (d: any) => (d?.is_blocked ? 'Website blockiert Embedding' : 'Embedding möglich'),
      error: 'Prüfung fehlgeschlagen',
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="h-[500px] rounded-2xl bg-gray-100 dark:bg-gray-900 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950 p-6">
        <div className="max-w-7xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(`${isPublic ? '/showcase' : '/sales/referenz-showcase'}/websites`)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Zurück
          </Button>
          <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">Website nicht gefunden.</p>
        </div>
      </div>
    );
  }

  const displayUrl = item.website_url?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') ?? '';
  const fallback = item.fallback_image_url || item.preview_image_url || item.thumbnail_url || null;
  const hasDescription = !!item.description;
  const tags = item.tags ?? [];
  const hasTags = tags.length > 0;

  return (
    <div className="min-h-screen bg-[#fafaf7] dark:bg-gray-950">
      {/* Back-Bar */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 md:px-10 lg:px-16 xl:px-20 py-4 flex items-center justify-between">
          <Link
            to={`${isPublic ? '/showcase' : '/sales/referenz-showcase'}/websites`}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Websites
          </Link>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-2" /> Teilen
            </Button>
            {isAdmin && (
              <>
                <Button variant="ghost" size="sm" onClick={handleRecheck} title="Embed-Status neu prüfen">
                  <RefreshCw className="w-4 h-4 mr-2" /> Status neu prüfen
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                  <Pencil className="w-4 h-4 mr-2" /> Bearbeiten
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDelete}
                  className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-300"
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Löschen
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-7xl mx-auto px-6 md:px-10 lg:px-16 xl:px-20 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Hero */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
              <div className="relative aspect-[16/10] bg-gray-50 dark:bg-gray-800">
                {item.website_url ? (
                  <div className="absolute inset-0">
                    <WebsiteEmbed
                      url={item.website_url}
                      title={item.title}
                      fallbackImageUrl={fallback}
                      height="100%"
                      showcaseId={item.id}
                      initialIsBlocked={item.is_iframe_blocked ?? null}
                      hasChecked={!!item.iframe_check_at}
                    />
                  </div>
                ) : fallback ? (
                  <img src={fallback} alt={item.title} className="w-full h-full object-cover object-top" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm text-gray-400 dark:text-gray-600">
                    Keine Vorschau
                  </div>
                )}

                {item.website_url && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-emerald-500/95 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg z-20 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    Live
                  </div>
                )}
              </div>

              {item.website_url && (
                <a
                  href={item.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 border-t border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Im neuen Tab öffnen
                </a>
              )}
            </div>
          </div>

          {/* Info-Panel */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm lg:sticky lg:top-6">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {(item.client_name || 'Kunde').toUpperCase()}
              </p>

              <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white leading-tight mb-4">
                {item.title}
              </h1>

              {item.website_url && (
                <a
                  href={item.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-lg font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 mb-6 truncate"
                >
                  {displayUrl}
                </a>
              )}

              {item.website_url && (
                <a
                  href={item.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3.5 rounded-xl transition-colors mb-3"
                >
                  <ExternalLink className="w-4 h-4" />
                  Website öffnen
                </a>
              )}

              {item.website_url && (
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center justify-center gap-2 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium py-3 rounded-xl transition-colors mb-6"
                >
                  <Copy className="w-4 h-4" />
                  Link kopieren
                </button>
              )}

              <div className="border-t border-gray-200 dark:border-gray-800 pt-5 space-y-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Projekt-Details</h3>

                {item.branche && (
                  <div className="flex items-start gap-3 text-sm">
                    <Tag className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">Branche</div>
                      <div className="text-gray-900 dark:text-white font-medium">{item.branche}</div>
                    </div>
                  </div>
                )}

                {item.client_name && (
                  <div className="flex items-start gap-3 text-sm">
                    <Building2 className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">Kunde</div>
                      <div className="text-gray-900 dark:text-white font-medium">{item.client_name}</div>
                    </div>
                  </div>
                )}

                {(item as any).linked_kunde?.unternehmen && (
                  <div className="flex items-start gap-3 text-sm">
                    <Briefcase className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">Unternehmen</div>
                      <div className="text-gray-900 dark:text-white font-medium">{(item as any).linked_kunde.unternehmen}</div>
                    </div>
                  </div>
                )}

                {item.created_at && (
                  <div className="flex items-start gap-3 text-sm">
                    <Calendar className="w-4 h-4 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs">Erstellt</div>
                      <div className="text-gray-900 dark:text-white font-medium">
                        {new Date(item.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {(hasDescription || hasTags) && (
          <div className="mt-16 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {hasDescription && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Beschreibung</h2>
                <div className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {item.description}
                </div>
              </section>
            )}

            {hasTags && (
              <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Tags</h2>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm rounded-md"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {editOpen && (
        <AddWebsiteModal
          open={editOpen}
          editing={item}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
