import { useState, useCallback, useRef } from 'react';
import { Bug, X, Loader2, CheckCircle2, Upload, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const PROBLEM_TYPES = [
  'Bug',
  'Darstellungsfehler',
  'Funktion fehlt',
  'Falscher Text',
  'Sonstiges',
];

function shortBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unbekannt';
}

export function BugReportWidget() {
  const { user } = useAuth();
  const { displayName } = useProfile();
  const [open, setOpen] = useState(false);
  const [problemType, setProblemType] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const now = new Date().toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Screenshot darf max. 5 MB groß sein.');
      return;
    }
    setScreenshot(file);
    const reader = new FileReader();
    reader.onload = () => setScreenshotPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!problemType || !description.trim() || submitting) return;
    setSubmitting(true);

    try {
      let screenshotUrl: string | null = null;

      if (screenshot) {
        const ext = screenshot.name.split('.').pop() || 'png';
        const path = `${user?.id || 'anon'}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('bug-reports')
          .upload(path, screenshot, { contentType: screenshot.type });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('bug-reports').getPublicUrl(path);
        screenshotUrl = urlData.publicUrl;
      }

      const { error: fnError } = await supabase.functions.invoke('report-bug', {
        body: {
          user_id: user?.id || null,
          user_name: displayName || user?.email || null,
          user_email: user?.email || null,
          page_url: window.location.pathname,
          problem_type: problemType,
          description: description.trim(),
          screenshot_url: screenshotUrl,
          browser_info: `${shortBrowser()} – ${navigator.platform}`,
          channel: 'tech-support',
        },
      });

      if (fnError) throw fnError;

      setSuccess(true);
      toast.success('Bug Report gesendet!');
    } catch (e) {
      console.error('Bug report failed:', e);
      toast.error('Fehler beim Senden. Bitte versuche es erneut.');
    } finally {
      setSubmitting(false);
    }
  }, [problemType, description, screenshot, submitting, user, displayName]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(() => {
      setProblemType('');
      setDescription('');
      setScreenshot(null);
      setScreenshotPreview(null);
      setSuccess(false);
    }, 300);
  }, []);

  return (
    <>
      {/* Floating Button */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen(true)}
              className="fixed bottom-20 right-6 z-40 w-11 h-11 rounded-full bg-card border border-border shadow-md flex items-center justify-center transition-all duration-150 hover:border-destructive hover:shadow-lg group md:flex hidden"
              aria-label="Fehler oder UI-Problem melden"
            >
              <Bug className="h-[18px] w-[18px] text-muted-foreground group-hover:text-destructive transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>Fehler oder UI-Problem melden</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/50 dark:bg-black/70" />

          <div className="relative w-full max-w-[480px] bg-card border border-border rounded-[14px] p-8 shadow-[0_24px_64px_rgba(0,0,0,0.18)] max-h-[90vh] overflow-y-auto">
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {success ? (
              <div className="flex flex-col items-center text-center py-4">
                <CheckCircle2 className="h-12 w-12 text-primary mb-4" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold text-foreground mb-1">Danke für dein Feedback! ✓</h3>
                <p className="text-sm text-muted-foreground mb-6">
                  Dein Bug Report wurde an das Entwicklungsteam weitergeleitet.
                </p>
                <Button onClick={handleClose} className="w-full max-w-[200px]">Schließen</Button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-start gap-3 mb-6">
                  <Bug className="h-6 w-6 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Problem melden</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Beschreibe was nicht stimmt — wir beheben es so schnell wie möglich.
                    </p>
                  </div>
                </div>

                {/* Auto-captured info */}
                <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4 overflow-hidden">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-2 tracking-wider">
                    AUTOMATISCH ERFASST
                  </p>
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span>Seite: <code className="font-mono text-[11px]">{window.location.pathname}</code></span>
                    <span>Browser: {shortBrowser()}</span>
                    <span>Zeitpunkt: {now}</span>
                    <span>Nutzer: {displayName || user?.email || 'Unbekannt'}</span>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Problemtyp *</label>
                    <Select value={problemType} onValueChange={setProblemType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Art des Problems wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {PROBLEM_TYPES.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Beschreibung *</label>
                    <div className="relative">
                      <Textarea
                        value={description}
                        onChange={e => setDescription(e.target.value.slice(0, 400))}
                        placeholder="Was ist passiert? Was hast du erwartet?"
                        className="min-h-[100px] resize-none"
                      />
                      <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">
                        {description.length}/400
                      </span>
                    </div>
                  </div>

                  {/* Screenshot */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Screenshot (optional)</label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    {screenshotPreview ? (
                      <div className="relative rounded-lg border border-border overflow-hidden">
                        <img src={screenshotPreview} alt="Screenshot" className="w-full max-h-[120px] object-cover" />
                        <button
                          onClick={() => { setScreenshot(null); setScreenshotPreview(null); }}
                          className="absolute top-1 right-1 bg-card/80 rounded-full p-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 text-xs"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Screenshot anhängen
                      </Button>
                    )}
                  </div>

                  <Button
                    onClick={handleSubmit}
                    disabled={!problemType || !description.trim() || submitting}
                    className="w-full h-11 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Wird gesendet...</>
                    ) : (
                      'Problem absenden'
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
