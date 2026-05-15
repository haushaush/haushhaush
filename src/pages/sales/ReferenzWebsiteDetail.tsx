import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsPublicView } from '@/hooks/useIsPublicView';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  ExternalLink,
  Trash2,
  RefreshCw,
  Check,
  Image as ImageIcon,
  Sparkles,
  Info,
} from 'lucide-react';
import { WebsiteEmbed } from '@/components/sales/WebsiteEmbed';
import { AddWebsiteModal } from '@/components/sales/AddWebsiteModal';
import {
  DetailPageLayout,
  DetailHero,
  DetailInfoPanel,
  InfoSection,
  InfoSectionTitle,
  DetailRowList,
  DetailRow,
  DetailPageSkeleton,
} from '@/components/showcase/DetailPageLayout';
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
  const [editMode, setEditMode] = useState(false);
  const [isShowingFallback, setIsShowingFallback] = useState(false);

  useEffect(() => {
    setIsShowingFallback(item?.is_iframe_blocked === true);
  }, [item?.id, item?.is_iframe_blocked]);

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

  useEffect(() => { load(); }, [id]);

  const backHref = `${isPublic ? '/showcase' : '/sales/referenz-showcase'}/websites`;

  async function handleDelete() {
    if (!item || !confirm('Diese Website wirklich löschen?')) return;
    const { error } = await supabase.from('referenz_showcase' as any).delete().eq('id', item.id);
    if (error) toast.error('Löschen fehlgeschlagen', { description: error.message });
    else { toast.success('Gelöscht'); navigate(backHref); }
  }

  async function handleRecheck() {
    if (!item?.website_url) return;
    const promise = supabase.functions
      .invoke('check-website-embeddable', { body: { showcase_id: item.id, url: item.website_url } })
      .then(({ data, error }) => { if (error) throw error; load(); return data; });
    toast.promise(promise, {
      loading: 'Prüfe Embed-Status…',
      success: (d: any) => (d?.is_blocked ? 'Website blockiert Embedding' : 'Embedding möglich'),
      error: 'Prüfung fehlgeschlagen',
    });
  }

  if (loading) return <DetailPageSkeleton />;
  if (!item) {
    return (
      <DetailPageLayout
        backHref={backHref}
        backLabel="Websites"
        hero={<DetailHero><div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Nicht gefunden</div></DetailHero>}
        infoPanel={<DetailInfoPanel><InfoSection><p className="text-sm text-gray-500">Website nicht gefunden.</p></InfoSection></DetailInfoPanel>}
      />
    );
  }

  const displayUrl = item.website_url?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') ?? '';
  const fallback = item.thumbnail_url || item.preview_image_url || item.fallback_image_url || null;
  const keyFeatures = ((item as any).key_features as string[] | null) ?? [];
  const linkedKunde = (item as any).linked_kunde as { unternehmen?: string; branche?: string } | null;

  return (
    <>
    <DetailPageLayout
      backHref={backHref}
      backLabel="Websites"
      isAdmin={isAdmin}
      editMode={editMode}
      onEditToggle={() => setEditMode(!editMode)}
      editActions={
        <>
          <Button variant="outline" size="sm" onClick={handleRecheck}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Status prüfen
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Daten bearbeiten
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-600 dark:text-red-400">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </>
      }
      hero={
        <DetailHero aspect="adaptive">
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
                onFallbackActivated={() => setIsShowingFallback(true)}
                onLiveActivated={() => setIsShowingFallback(false)}
              />
            </div>
          ) : fallback ? (
            <img src={fallback} alt={item.title} className="absolute inset-0 w-full h-full object-cover object-top" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 dark:text-gray-600">
              Keine Vorschau
            </div>
          )}

          {item.website_url && (
            <div className="absolute bottom-4 left-4">
              {isShowingFallback ? (
                <div className="flex items-center gap-1.5 bg-gray-700/95 dark:bg-gray-800/95 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg pointer-events-none">
                  <ImageIcon className="w-3 h-3" /> Screenshot
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-emerald-500/95 backdrop-blur-md text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg pointer-events-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
                </div>
              )}
            </div>
          )}
        </DetailHero>
      }
      infoPanel={
        <DetailInfoPanel>
          <InfoSection>
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.08em] mb-1.5">
              {item.client_name || 'Kunde'}
            </p>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white leading-tight tracking-tight">
              {item.title}
            </h1>
            {item.website_url && (
              <a
                href={item.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-600 dark:text-teal-400 hover:underline truncate max-w-full"
              >
                <span className="truncate">{displayUrl}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            )}
          </InfoSection>

          {item.website_url && (
            <InfoSection>
              <a
                href={item.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 font-bold py-3 rounded-xl transition-all hover:scale-[1.01] active:scale-[0.99]"
              >
                Website öffnen
                <ExternalLink className="w-4 h-4" />
              </a>
            </InfoSection>
          )}

          {keyFeatures.length > 0 && (
            <InfoSection>
              <InfoSectionTitle icon={Sparkles}>Highlights</InfoSectionTitle>
              <ul className="space-y-2.5">
                {keyFeatures.slice(0, 5).map((feat, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                    <Check className="w-4 h-4 mt-0.5 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </InfoSection>
          )}

          <InfoSection>
            <InfoSectionTitle icon={Info}>Details</InfoSectionTitle>
            <DetailRowList>
              {(item.branche || linkedKunde?.branche) && (
                <DetailRow label="Branche" value={item.branche || linkedKunde?.branche} capitalize />
              )}
              {linkedKunde?.unternehmen && <DetailRow label="Unternehmen" value={linkedKunde.unternehmen} />}
              {item.client_name && <DetailRow label="Kunde" value={item.client_name} />}
              {item.created_at && (
                <DetailRow
                  label="Erstellt"
                  value={new Date(item.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
                />
              )}
            </DetailRowList>
          </InfoSection>
        </DetailInfoPanel>
      }
      belowContent={
        <>
          {item.description && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-4">Über das Projekt</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                {item.description}
              </p>
            </section>
          )}
          {item.tags && item.tags.length > 0 && (
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-3">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      }
      editForm={
        <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Bearbeite die Showcase-Daten dieser Website über den Modal-Dialog.
          </p>
          <Button className="mt-4" onClick={() => setEditOpen(true)}>
            Daten bearbeiten
          </Button>
        </section>
      }
    />
    {editOpen && (
      <AddWebsiteModal
        open={editOpen}
        editing={item}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); load(); }}
      />
    )}
    </>
  );
}
