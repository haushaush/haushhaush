import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Globe, Camera, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { testIframeEmbed } from './WebsiteEmbed';
import type { ShowcaseRow } from '@/pages/sales/ReferenzShowcaseShared';

interface Props {
  open: boolean;
  editing: ShowcaseRow | null;
  onClose: () => void;
  onSaved: () => void;
}

type Stage = 'input' | 'testing' | 'iframe_works' | 'screenshot_taken' | 'manual_required' | 'meta';

export function AddWebsiteModal({ open, editing, onClose, onSaved }: Props) {
  const isEdit = !!editing;
  const [stage, setStage] = useState<Stage>(isEdit ? 'meta' : 'input');
  const [url, setUrl] = useState(editing?.website_url ?? '');
  const [embedMethod, setEmbedMethod] = useState<'iframe' | 'screenshot' | 'manual'>(
    (editing?.embed_method as any) ?? 'iframe'
  );
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(editing?.screenshot_url ?? null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(editing?.preview_image_url ?? null);

  // Meta fields
  const [title, setTitle] = useState(editing?.title ?? '');
  const [clientName, setClientName] = useState(editing?.client_name ?? '');
  const [linkedKundeId, setLinkedKundeId] = useState<string>(editing?.linked_kunde_id ?? '');
  const [branche, setBranche] = useState(editing?.branche ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [tagsInput, setTagsInput] = useState((editing?.tags ?? []).join(', '));
  const [isFeatured, setIsFeatured] = useState(editing?.is_featured ?? false);
  const [leads, setLeads] = useState<string>(editing?.metrics?.leads?.toString() ?? '');
  const [cpl, setCpl] = useState<string>(editing?.metrics?.cpl?.toString() ?? '');
  const [roas, setRoas] = useState<string>(editing?.metrics?.roas?.toString() ?? '');
  const [ctr, setCtr] = useState<string>(editing?.metrics?.ctr?.toString() ?? '');

  const [kunden, setKunden] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unpublishedWarning, setUnpublishedWarning] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('close_deals').select('id, client_name').limit(500).then(({ data }) => {
      const list = (data ?? []).map((d: any) => ({ id: d.id, name: d.client_name ?? d.id }));
      setKunden(list);
    });
  }, []);

  function normalizeUrl(input: string): string {
    const t = input.trim();
    if (!t) return '';
    if (!/^https?:\/\//i.test(t)) return `https://${t}`;
    return t;
  }

  async function handleTestUrl() {
    const normalized = normalizeUrl(url);
    if (!normalized) { toast.error('URL erforderlich'); return; }
    setUrl(normalized);
    setUnpublishedWarning(null);
    setStage('testing');

    // Step 1: try iframe
    const canEmbed = await testIframeEmbed(normalized, 4000);

    // Step 2: ALWAYS generate a screenshot in parallel (used for grid card + fallback)
    let shotUrl: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('screenshot-website', {
        body: { url: normalized },
      });
      if (error) throw error;
      if (data?.error === 'unpublished') {
        setUnpublishedWarning(data.message || 'Website ist nicht veröffentlicht.');
        setStage('input');
        return;
      }
      if (data?.ok && data.screenshot_url) {
        shotUrl = data.screenshot_url;
        setScreenshotUrl(shotUrl);
      }
    } catch (e: any) {
      // Screenshot failure is non-fatal if iframe works
      if (!canEmbed) {
        toast.error('Auto-Screenshot fehlgeschlagen', { description: e.message });
      }
    }

    if (!title) {
      try {
        const u = new URL(normalized);
        setTitle(u.hostname.replace(/^www\./, ''));
      } catch {}
    }

    if (canEmbed) {
      setEmbedMethod('iframe');
      setStage('iframe_works');
      return;
    }

    if (shotUrl) {
      setEmbedMethod('screenshot');
      setStage('screenshot_taken');
      return;
    }

    setStage('manual_required');
  }

  async function handleManualUpload(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const path = `websites/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('referenz-showcase').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('referenz-showcase').getPublicUrl(path);
      setPreviewImageUrl(publicUrl);
      setScreenshotUrl(publicUrl);
      setEmbedMethod('manual');
      toast.success('Hochgeladen');
    } catch (e: any) {
      toast.error('Upload fehlgeschlagen', { description: e.message });
    } finally {
      setUploading(false);
    }
  }

  async function handleProceedToMeta() {
    setStage('meta');
  }

  async function handleSave() {
    if (!title.trim()) { toast.error('Titel ist erforderlich'); return; }
    setSaving(true);

    const metrics: Record<string, any> = {};
    if (leads) metrics.leads = Number(leads);
    if (cpl) metrics.cpl = Number(cpl);
    if (roas) metrics.roas = Number(roas);
    if (ctr) metrics.ctr = Number(ctr);

    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    const payload: any = {
      type: 'website',
      title: title.trim(),
      client_name: clientName.trim() || null,
      linked_kunde_id: linkedKundeId || null,
      branche: branche.trim() || null,
      description: description.trim() || null,
      website_url: url || null,
      preview_image_url: previewImageUrl || null,
      screenshot_url: screenshotUrl || null,
      embed_method: embedMethod,
      embed_blocked: embedMethod !== 'iframe',
      last_embed_check_at: new Date().toISOString(),
      tags,
      is_featured: isFeatured,
      metrics: Object.keys(metrics).length > 0 ? metrics : null,
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
      toast.success(editing ? 'Aktualisiert' : 'Hinzugefügt');
      onSaved();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen', { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Website bearbeiten' : 'Website hinzufügen'}</DialogTitle>
        </DialogHeader>

        {stage === 'input' && (
          <div className="space-y-4 py-2">
            <div>
              <Label>Website URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.de"
                onKeyDown={(e) => { if (e.key === 'Enter') handleTestUrl(); }}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Wir prüfen automatisch, ob Live-Embedding möglich ist. Wenn nicht: Screenshot-Fallback.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button onClick={handleTestUrl} disabled={!url.trim()}>
                <Globe className="w-4 h-4 mr-2" /> URL testen
              </Button>
            </div>
          </div>
        )}

        {stage === 'testing' && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Prüfe Embedding-Möglichkeiten…</p>
            <ol className="text-xs text-muted-foreground space-y-0.5">
              <li>1. Live-Embedding versuchen</li>
              <li>2. Falls blockiert: Auto-Screenshot via Microlink</li>
            </ol>
          </div>
        )}

        {stage === 'iframe_works' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-primary">
              <CheckCircle2 className="w-4 h-4" /> Live-Embedding möglich
            </div>
            <iframe
              src={url}
              title="preview"
              className="w-full rounded border border-border bg-white"
              style={{ height: 360 }}
              sandbox="allow-scripts allow-same-origin"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStage('input')}>Zurück</Button>
              <Button onClick={handleProceedToMeta}>Weiter →</Button>
            </div>
          </div>
        )}

        {stage === 'screenshot_taken' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="w-4 h-4" /> Live-Embed blockiert — Screenshot wurde erstellt
            </div>
            {screenshotUrl && (
              <img src={screenshotUrl} alt="Screenshot" className="w-full rounded border border-border" />
            )}
            <div className="flex justify-between gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => setStage('manual_required')}>
                <Upload className="w-4 h-4 mr-1.5" /> Eigenen Screenshot hochladen
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStage('input')}>Zurück</Button>
                <Button onClick={handleProceedToMeta}>Weiter →</Button>
              </div>
            </div>
          </div>
        )}

        {stage === 'manual_required' && (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" /> Bitte manuell Screenshot hochladen
            </div>
            <div>
              <Label>Screenshot</Label>
              <div className="flex items-center gap-2">
                {previewImageUrl && (
                  <img src={previewImageUrl} alt="" className="w-20 h-12 object-cover rounded border border-border" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleManualUpload(e.target.files[0])}
                  className="text-sm"
                  disabled={uploading}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStage('input')}>Zurück</Button>
              <Button onClick={handleProceedToMeta} disabled={!previewImageUrl && !screenshotUrl}>
                Weiter →
              </Button>
            </div>
          </div>
        )}

        {stage === 'meta' && (
          <div className="space-y-4">
            {/* Compact preview */}
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded border border-border">
              <Camera className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">{url || '—'}</div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-0.5">
                  Methode: {embedMethod}
                </div>
              </div>
              {!isEdit && (
                <Button variant="ghost" size="sm" onClick={() => setStage('input')}>Ändern</Button>
              )}
            </div>

            <div>
              <Label>Titel *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kunde (Close Deal)</Label>
                <select
                  value={linkedKundeId}
                  onChange={(e) => {
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
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Branche</Label>
              <Input value={branche} onChange={(e) => setBranche(e.target.value)} placeholder="z.B. Versicherung – PKV" />
            </div>

            <div>
              <Label>Beschreibung</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Performance Metriken</div>
              <div className="grid grid-cols-4 gap-3">
                <div><Label>Leads</Label><Input type="number" value={leads} onChange={(e) => setLeads(e.target.value)} /></div>
                <div><Label>CPL (€)</Label><Input type="number" step="0.01" value={cpl} onChange={(e) => setCpl(e.target.value)} /></div>
                <div><Label>ROAS</Label><Input type="number" step="0.1" value={roas} onChange={(e) => setRoas(e.target.value)} /></div>
                <div><Label>CTR (%)</Label><Input type="number" step="0.1" value={ctr} onChange={(e) => setCtr(e.target.value)} /></div>
              </div>
            </div>

            <div>
              <Label>Tags (komma-getrennt)</Label>
              <Input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="B2C, PKV, Mobile" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="featured-w" />
              <Label htmlFor="featured-w" className="cursor-pointer">Als Featured markieren</Label>
            </div>

            {isEdit && (
              <div className="border-t border-border pt-4">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Embed-Methode überschreiben</Label>
                <div className="flex gap-3 mt-2 text-sm">
                  {(['iframe', 'screenshot', 'manual'] as const).map(m => (
                    <label key={m} className="flex items-center gap-1.5">
                      <input type="radio" checked={embedMethod === m} onChange={() => setEmbedMethod(m)} /> {m}
                    </label>
                  ))}
                </div>
                {embedMethod === 'manual' && (
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleManualUpload(e.target.files[0])}
                    className="text-sm mt-2"
                  />
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={saving || uploading}>
                {saving ? 'Speichert…' : 'Speichern'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
