import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, ImageIcon, X, Plus, Camera, RefreshCw, Upload } from 'lucide-react';
import { WebsiteEmbed } from './WebsiteEmbed';
import type { ShowcaseRow } from '@/pages/sales/ReferenzShowcaseShared';

interface Props {
  open: boolean;
  editing: ShowcaseRow | null;
  onClose: () => void;
  onSaved: () => void;
}

type Stage = 'input' | 'preview' | 'saving';

const BRANCHEN = ['PKV', 'BU', 'KFZ', 'Rechtsschutz', 'Beihilfe', 'Unfall', 'Sonstige'];

function normalizeUrl(input: string): string {
  const t = input.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function TagInput({
  value = [],
  onChange,
  max = 6,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= max) return;
    onChange([...value, trimmed]);
    setInput('');
  };
  const removeTag = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder={placeholder}
          disabled={value.length >= max}
          className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm placeholder:text-gray-400 disabled:opacity-50"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTag}
          disabled={!input.trim() || value.length >= max}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-teal-50 dark:bg-teal-950 text-teal-900 dark:text-teal-100 text-sm rounded-md"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="hover:bg-teal-100 dark:hover:bg-teal-900 rounded p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {value.length >= max && (
        <p className="text-xs text-gray-400">Maximum {max} Highlights erreicht</p>
      )}
    </div>
  );
}

export function AddWebsiteModal({ open, editing, onClose, onSaved }: Props) {
  const isEdit = !!editing;
  const [stage, setStage] = useState<Stage>('input');
  const [url, setUrl] = useState(editing?.website_url ?? '');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [clientName, setClientName] = useState(editing?.client_name ?? '');
  const [branche, setBranche] = useState(editing?.branche ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [isFeatured, setIsFeatured] = useState(editing?.is_featured ?? false);
  const [keyFeatures, setKeyFeatures] = useState<string[]>(((editing as any)?.key_features as string[]) ?? []);
  const [fallbackFile, setFallbackFile] = useState<File | null>(null);
  const [existingFallbackUrl, setExistingFallbackUrl] = useState<string | null>(
    (editing as any)?.fallback_image_url ?? null
  );
  const [fallbackPreviewUrl, setFallbackPreviewUrl] = useState<string | null>(null);

  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [existingThumbnailUrl, setExistingThumbnailUrl] = useState<string | null>(
    (editing as any)?.thumbnail_url ?? null
  );
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [autoThumbnailUrl, setAutoThumbnailUrl] = useState<string | null>(null);
  const [thumbnailMode, setThumbnailMode] = useState<'auto' | 'manual'>(
    editing?.thumbnail_url ? 'manual' : 'auto'
  );
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!fallbackFile) { setFallbackPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(fallbackFile);
    setFallbackPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [fallbackFile]);

  useEffect(() => {
    if (!thumbnailFile) { setThumbnailPreviewUrl(null); return; }
    const objectUrl = URL.createObjectURL(thumbnailFile);
    setThumbnailPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [thumbnailFile]);

  function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Bitte ein Bild auswählen'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Bild zu groß (max. 5MB)'); return; }
    setThumbnailFile(file);
  }

  async function generateThumbnail() {
    const normalized = normalizeUrl(url);
    if (!normalized.startsWith('http')) {
      toast.error('Bitte gültige URL eingeben');
      return;
    }
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-website-thumbnail', {
        body: { url: normalized },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      const thumb = (data as any)?.thumbnail_url as string | undefined;
      const src = (data as any)?.source as string | undefined;
      if (!thumb) throw new Error('Kein Thumbnail erhalten');
      setAutoThumbnailUrl(thumb);
      toast.success(src === 'microlink' ? 'Screenshot erstellt' : 'OpenGraph-Bild übernommen');
    } catch (e: any) {
      toast.error(`Auto-Thumbnail fehlgeschlagen: ${e.message}`);
      setThumbnailMode('manual');
    } finally {
      setIsGenerating(false);
    }
  }

  function handleNext() {
    if (!url.trim()) {
      toast.error('URL ist erforderlich');
      return;
    }
    const normalized = normalizeUrl(url);
    setUrl(normalized);

    if (!title.trim()) {
      try {
        const u = new URL(normalized);
        setTitle(u.hostname.replace(/^www\./, ''));
      } catch {}
    }
    setStage('preview');
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error('Titel ist erforderlich');
      return;
    }
    setStage('saving');

    try {
      let fallbackUrl: string | null = existingFallbackUrl;
      let thumbnailUrl: string | null = existingThumbnailUrl;

      if (thumbnailMode === 'auto' && autoThumbnailUrl) {
        thumbnailUrl = autoThumbnailUrl;
      }

      if (thumbnailFile) {
        const ext = thumbnailFile.name.split('.').pop() || 'jpg';
        const path = `websites/thumbnails/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('referenz-showcase')
          .upload(path, thumbnailFile, { upsert: false, contentType: thumbnailFile.type, cacheControl: '31536000' });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage
          .from('referenz-showcase')
          .getPublicUrl(path);
        thumbnailUrl = publicUrl;
        if (!fallbackUrl && !fallbackFile) fallbackUrl = publicUrl;
      }

      if (fallbackFile) {
        const ext = fallbackFile.name.split('.').pop() || 'png';
        const path = `websites/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('referenz-showcase')
          .upload(path, fallbackFile, { upsert: false });
        if (upErr) throw upErr;
        const { data: { publicUrl } } = supabase.storage
          .from('referenz-showcase')
          .getPublicUrl(path);
        fallbackUrl = publicUrl;
      }

      const cleanUrl = normalizeUrl(url);

      const payload: any = {
        type: 'website',
        title: title.trim(),
        client_name: clientName.trim() || null,
        branche: branche.trim() || null,
        description: description.trim() || null,
        website_url: cleanUrl,
        fallback_image_url: fallbackUrl,
        thumbnail_url: thumbnailUrl,
        is_featured: isFeatured,
        is_active: true,
        key_features: keyFeatures.length > 0 ? keyFeatures : null,
      };

      if (editing) {
        const { error } = await supabase
          .from('referenz_showcase' as any)
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload.created_by = u.user?.id ?? null;
        const { error } = await supabase
          .from('referenz_showcase' as any)
          .insert(payload);
        if (error) throw error;
      }

      toast.success(editing ? 'Aktualisiert' : 'Website hinzugefügt');
      onSaved();
    } catch (e: any) {
      toast.error('Speichern fehlgeschlagen', { description: e.message });
      setStage('preview');
    }
  }

  const previewFallback = fallbackPreviewUrl || existingFallbackUrl || undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Website bearbeiten' : 'Website hinzufügen'}</DialogTitle>
        </DialogHeader>

        {stage === 'input' && (
          <div className="space-y-4 py-2">
            <div>
              <Label>Thumbnail *</Label>
              {(thumbnailPreviewUrl || existingThumbnailUrl) ? (
                <div className="relative mt-1">
                  <img
                    src={thumbnailPreviewUrl || existingThumbnailUrl || ''}
                    alt="Thumbnail Vorschau"
                    className="w-full rounded border border-border object-cover"
                    style={{ aspectRatio: '16/9' }}
                  />
                  <button
                    type="button"
                    onClick={() => { setThumbnailFile(null); setExistingThumbnailUrl(null); }}
                    className="absolute top-2 right-2 bg-background/90 border border-border shadow rounded-full w-7 h-7 flex items-center justify-center hover:bg-muted"
                    aria-label="Thumbnail entfernen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="mt-1 block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors">
                  <input type="file" accept="image/*" onChange={handleThumbnailChange} className="hidden" />
                  <ImageIcon className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">Bild auswählen</p>
                  <p className="text-xs text-muted-foreground mt-1">Empfohlen: 800×450px (16:9) · max. 5MB</p>
                </label>
              )}
            </div>
            <div>
              <Label>Website-URL *</Label>
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://kunde.de"
                autoFocus
              />
            </div>
            <div>
              <Label>Titel *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Marvin Rixen BU-Funnel"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Kunde</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Marvin Rixen" />
              </div>
              <div>
                <Label>Branche</Label>
                <select
                  value={branche}
                  onChange={(e) => setBranche(e.target.value)}
                  className="w-full h-10 bg-background border border-input rounded-md px-3 text-sm"
                >
                  <option value="">Wählen...</option>
                  {BRANCHEN.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>
                Highlights <span className="text-gray-400 text-xs font-normal">(optional, max 6)</span>
              </Label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                z.B. "Live-Chat integriert", "Multi-Step-Funnel", "Calendly-Buchung"
              </p>
              <TagInput
                value={keyFeatures}
                onChange={setKeyFeatures}
                max={6}
                placeholder="Highlight eingeben + Enter"
              />
            </div>
            <div>
              <Label>Fallback-Bild (optional)</Label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFallbackFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Wird angezeigt, falls die Website das Embedden blockiert. Tipp: Browser-Screenshot
                (Strg+Shift+S oder F12 → Device Toolbar) reicht.
              </p>
              {(previewFallback) && (
                <img src={previewFallback} alt="" className="mt-2 max-h-32 rounded border border-border" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isFeatured} onCheckedChange={setIsFeatured} id="feat-w" />
              <Label htmlFor="feat-w" className="cursor-pointer">Als Featured markieren</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Abbrechen</Button>
              <Button
                onClick={handleNext}
                disabled={!url.trim() || !title.trim() || (!thumbnailFile && !existingThumbnailUrl)}
              >
                Weiter →
              </Button>
            </div>
          </div>
        )}

        {stage === 'preview' && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">So sieht's im Showcase aus:</p>
            <WebsiteEmbed url={normalizeUrl(url)} title={title} fallbackImageUrl={previewFallback} height={420} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStage('input')}>← Zurück</Button>
              <Button onClick={handleSave}>Speichern</Button>
            </div>
          </div>
        )}

        {stage === 'saving' && (
          <div className="py-12 flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm">Speichere…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
