import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import type { ShowcaseRow } from '@/pages/sales/ReferenzShowcaseShared';

interface Props {
  open: boolean;
  type: 'website' | 'werbeanzeige';
  editing: ShowcaseRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ReferenzShowcaseFormModal({ open, type: initialType, editing, onClose, onSaved }: Props) {
  const [type, setType] = useState<'website' | 'werbeanzeige'>(editing?.type ?? initialType);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [clientName, setClientName] = useState(editing?.client_name ?? '');
  const [linkedKundeId, setLinkedKundeId] = useState<string | ''>(editing?.linked_kunde_id ?? '');
  const [branche, setBranche] = useState(editing?.branche ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(editing?.website_url ?? '');
  const [previewImageUrl, setPreviewImageUrl] = useState(editing?.preview_image_url ?? '');
  const [videoUrl, setVideoUrl] = useState(editing?.video_url ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(editing?.thumbnail_url ?? '');
  const [adPlatform, setAdPlatform] = useState(editing?.ad_platform ?? 'meta');
  const [adFormat, setAdFormat] = useState(editing?.ad_format ?? 'video');
  const [leads, setLeads] = useState<string>(editing?.metrics?.leads?.toString() ?? '');
  const [cpl, setCpl] = useState<string>(editing?.metrics?.cpl?.toString() ?? '');
  const [roas, setRoas] = useState<string>(editing?.metrics?.roas?.toString() ?? '');
  const [ctr, setCtr] = useState<string>(editing?.metrics?.ctr?.toString() ?? '');
  const [periodStart, setPeriodStart] = useState(editing?.campaign_period_start ?? '');
  const [periodEnd, setPeriodEnd] = useState(editing?.campaign_period_end ?? '');
  const [tagsInput, setTagsInput] = useState((editing?.tags ?? []).join(', '));
  const [isFeatured, setIsFeatured] = useState(editing?.is_featured ?? false);
  const [isPublic, setIsPublic] = useState<boolean>((editing as any)?.is_public ?? true);
  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    supabase.from('close_deals').select('id, client_name').limit(500).then(({ data }) => {
      const list = (data ?? []).map((d: any) => ({ id: d.id, name: d.client_name ?? d.id }));
      setKunden(list);
    });
  }, []);

  const handleUpload = async (file: File, target: 'preview' | 'thumbnail') => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${type}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('referenz-showcase').upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('referenz-showcase').getPublicUrl(path);
      if (target === 'preview') setPreviewImageUrl(publicUrl);
      else setThumbnailUrl(publicUrl);
      toast.success('Datei hochgeladen');
    } catch (e: any) {
      toast.error('Upload fehlgeschlagen', { description: e.message });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error('Titel ist erforderlich'); return; }
    setSaving(true);

    const metrics: Record<string, any> = {};
    if (leads) metrics.leads = Number(leads);
    if (cpl) metrics.cpl = Number(cpl);
    if (roas) metrics.roas = Number(roas);
    if (ctr) metrics.ctr = Number(ctr);

    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    const payload: any = {
      type,
      title: title.trim(),
      client_name: clientName.trim() || null,
      linked_kunde_id: linkedKundeId || null,
      branche: branche.trim() || null,
      description: description.trim() || null,
      website_url: type === 'website' ? (websiteUrl.trim() || null) : null,
      preview_image_url: type === 'website' ? (previewImageUrl || null) : null,
      video_url: type === 'werbeanzeige' ? (videoUrl.trim() || null) : null,
      thumbnail_url: type === 'werbeanzeige' ? (thumbnailUrl || null) : null,
      ad_platform: type === 'werbeanzeige' ? adPlatform : null,
      ad_format: type === 'werbeanzeige' ? adFormat : null,
      metrics: Object.keys(metrics).length > 0 ? metrics : null,
      campaign_period_start: periodStart || null,
      campaign_period_end: periodEnd || null,
      tags,
      is_featured: isFeatured,
      is_public: isPublic,
    };

    try {
      if (editing) {
        const { error } = await supabase.from('referenz_showcase' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id ?? null;
        const { error } = await supabase.from('referenz_showcase' as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? 'Referenz aktualisiert' : 'Referenz hinzugefügt');
      onSaved();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen', { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent persistent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Referenz bearbeiten' : 'Referenz hinzufügen'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={type === 'website'} onChange={() => setType('website')} /> Website
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={type === 'werbeanzeige'} onChange={() => setType('werbeanzeige')} /> Werbeanzeige
            </label>
          </div>

          <div>
            <Label>Titel *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Kunde (Close Deal)</Label>
              <select
                value={linkedKundeId}
                onChange={e => {
                  setLinkedKundeId(e.target.value);
                  const k = kunden.find(x => x.id === e.target.value);
                  if (k && !clientName) setClientName(k.name);
                }}
                className="w-full h-10 bg-background border border-input rounded-md px-3 text-sm"
              >
                <option value="">— keiner —</option>
                {kunden.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Kundenname (Anzeige)</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Branche</Label>
            <Input value={branche} onChange={e => setBranche(e.target.value)} placeholder="z.B. Versicherung - PKV" />
          </div>

          <div>
            <Label>Beschreibung</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} />
          </div>

          {type === 'website' ? (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Website Details</div>
              <div>
                <Label>Website URL</Label>
                <Input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Screenshot</Label>
                <div className="flex items-center gap-2">
                  {previewImageUrl && <img src={previewImageUrl} alt="" className="w-16 h-10 object-cover rounded" />}
                  <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'preview')} className="text-sm" />
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Werbeanzeige Details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Plattform</Label>
                  <select value={adPlatform} onChange={e => setAdPlatform(e.target.value)} className="w-full h-10 bg-background border border-input rounded-md px-3 text-sm">
                    <option value="meta">Meta</option>
                    <option value="google">Google</option>
                    <option value="tiktok">TikTok</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>
                <div>
                  <Label>Format</Label>
                  <select value={adFormat} onChange={e => setAdFormat(e.target.value)} className="w-full h-10 bg-background border border-input rounded-md px-3 text-sm">
                    <option value="video">Video</option>
                    <option value="reel">Reel</option>
                    <option value="image">Bild</option>
                    <option value="carousel">Carousel</option>
                    <option value="story">Story</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Video URL</Label>
                <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="YouTube/Vimeo/Direct Link" />
              </div>
              <div>
                <Label>Thumbnail</Label>
                <div className="flex items-center gap-2">
                  {thumbnailUrl && <img src={thumbnailUrl} alt="" className="w-16 h-10 object-cover rounded" />}
                  <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'thumbnail')} className="text-sm" />
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Performance Metriken</div>
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Leads</Label><Input type="number" value={leads} onChange={e => setLeads(e.target.value)} /></div>
              <div><Label>CPL (€)</Label><Input type="number" step="0.01" value={cpl} onChange={e => setCpl(e.target.value)} /></div>
              <div><Label>ROAS</Label><Input type="number" step="0.1" value={roas} onChange={e => setRoas(e.target.value)} /></div>
              <div><Label>CTR (%)</Label><Input type="number" step="0.1" value={ctr} onChange={e => setCtr(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Zeitraum von</Label><Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
              <div><Label>Zeitraum bis</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
            </div>
          </div>

          <div>
            <Label>Tags (komma-getrennt)</Label>
            <Input value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="B2C, Reel, Authentisch" />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="featured" />
            <Label htmlFor="featured" className="cursor-pointer">Als Featured markieren</Label>
          </div>

          <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div>
              <Label htmlFor="is_public" className="cursor-pointer text-sm font-medium">Öffentlich sichtbar</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Wenn aktiv, im /showcase-Bereich ohne Login sichtbar.</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} id="is_public" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving ? 'Speichert…' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
