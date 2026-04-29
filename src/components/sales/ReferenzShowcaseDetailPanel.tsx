import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Share2, Pencil, Trash2, ExternalLink } from 'lucide-react';
import type { ShowcaseRow } from '@/pages/sales/ReferenzShowcaseShared';

interface Props {
  item: ShowcaseRow;
  isAdmin: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

export function ReferenzShowcaseDetailPanel({ item, isAdmin, onClose, onEdit, onDeleted }: Props) {
  const m = (item.metrics ?? {}) as Record<string, any>;
  const img = item.type === 'website' ? item.preview_image_url : item.thumbnail_url;

  const handleShare = async () => {
    const url = `${window.location.origin}/showcase/${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link kopiert', { description: url });
    } catch {
      toast.info(url);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Diese Referenz wirklich löschen?')) return;
    const { error } = await supabase.from('referenz_showcase' as any).delete().eq('id', item.id);
    if (error) toast.error('Löschen fehlgeschlagen', { description: error.message });
    else { toast.success('Gelöscht'); onDeleted(); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <div className="aspect-[16/9] bg-muted relative overflow-hidden">
          {item.type === 'werbeanzeige' && item.video_url ? (
            <video src={item.video_url} controls poster={item.thumbnail_url ?? undefined} className="w-full h-full object-contain bg-black" />
          ) : img ? (
            <img src={img} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">Kein Bild</div>
          )}
        </div>

        <div className="p-6">
          <h2 className="text-xl font-semibold">{item.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {[item.client_name, item.branche, item.ad_platform].filter(Boolean).join(' · ')}
          </p>

          {Object.keys(m).length > 0 && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Performance</div>
              <ul className="text-sm space-y-1 tabular-nums">
                {m.leads != null && <li>• {m.leads} Leads generiert</li>}
                {m.cpl != null && <li>• {m.cpl}€ CPL</li>}
                {m.roas != null && <li>• {m.roas}x ROAS</li>}
                {m.ctr != null && <li>• {m.ctr}% CTR</li>}
                {(item.campaign_period_start || item.campaign_period_end) && (
                  <li>• Zeitraum: {item.campaign_period_start ?? '?'} – {item.campaign_period_end ?? '?'}</li>
                )}
              </ul>
            </div>
          )}

          {item.description && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Beschreibung</div>
              <p className="text-sm whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {item.tags && item.tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {item.tags.map(t => (
                <span key={t} className="text-[11px] bg-muted text-muted-foreground rounded px-2 py-0.5">{t}</span>
              ))}
            </div>
          )}

          {item.website_url && (
            <a href={item.website_url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1.5 mt-5 text-sm text-primary hover:underline">
              <ExternalLink className="w-3.5 h-3.5" /> Website öffnen
            </a>
          )}

          <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="w-4 h-4 mr-1.5" /> Link teilen
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="w-4 h-4 mr-1.5" /> Bearbeiten
                </Button>
                <Button variant="outline" size="sm" onClick={handleDelete} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-1.5" /> Löschen
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
