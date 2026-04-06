import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Loader2, Sparkles, Wrench, Check, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SupportModal from '@/components/SupportModal';
import { toast } from 'sonner';

interface ErrorPageProps {
  type: '404' | 'crash' | 'unauthorized' | 'offline';
  error?: Error | null;
}

interface AutoFix {
  label: string;
  action: 'localStorage_clear' | 'session_reload' | 'cache_clear' | 'state_reset' | 'auth_retry';
  description: string;
}

interface DiagnosisResult {
  diagnosis: string;
  likely_cause: string;
  auto_fixes: AutoFix[];
  manual_steps: string[];
  severity: 'low' | 'medium' | 'high';
}

const icons = {
  '404': (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-float">
      <rect x="8" y="16" width="40" height="48" rx="6" stroke="#0A9396" strokeWidth="1.5" />
      <path d="M48 28L64 28C67.3137 28 70 30.6863 70 34V58C70 61.3137 67.3137 64 64 64H38" stroke="#0A9396" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="28" cy="40" r="8" stroke="#0A9396" strokeWidth="1.5" />
      <path d="M34 46L42 54" stroke="#0A9396" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  crash: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-float">
      <path d="M40 8L72 64H8L40 8Z" stroke="#0A9396" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M40 30V46" stroke="#0A9396" strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="54" r="2" fill="#0A9396" />
    </svg>
  ),
  unauthorized: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-float">
      <rect x="20" y="36" width="40" height="32" rx="4" stroke="#0A9396" strokeWidth="1.5" />
      <path d="M28 36V28C28 21.3726 33.3726 16 40 16C46.6274 16 52 21.3726 52 28V36" stroke="#0A9396" strokeWidth="1.5" />
      <circle cx="40" cy="52" r="4" stroke="#0A9396" strokeWidth="1.5" />
    </svg>
  ),
  offline: (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="animate-float">
      <path d="M16 32C22.4 24 30.4 20 40 20C49.6 20 57.6 24 64 32" stroke="#0A9396" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 42C28.4 36.8 33.6 34 40 34C46.4 34 51.6 36.8 56 42" stroke="#0A9396" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="40" cy="54" r="4" fill="#0A9396" />
      <path d="M20 20L60 60" stroke="#0A9396" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const textConfig = {
  '404': {
    code: '404',
    heading: 'Seite nicht gefunden',
    subtext: 'Diese Seite existiert nicht oder wurde verschoben.',
    secondaryLabel: 'Zurück',
    secondaryAction: () => { window.history.back(); },
  },
  crash: {
    code: '500',
    heading: 'Etwas ist schiefgelaufen',
    subtext: 'Ein unerwarteter Fehler ist aufgetreten.',
    secondaryLabel: 'Seite neu laden',
    secondaryAction: () => { window.location.reload(); },
  },
  unauthorized: {
    code: '403',
    heading: 'Kein Zugriff',
    subtext: 'Du hast keine Berechtigung, diese Seite zu sehen.',
    secondaryLabel: 'Zum Login',
    secondaryAction: () => { window.location.href = '/auth'; },
  },
  offline: {
    code: '',
    heading: 'Keine Internetverbindung',
    subtext: 'Bitte überprüfe deine Verbindung und versuche es erneut.',
    secondaryLabel: 'Seite neu laden',
    secondaryAction: () => { window.location.reload(); },
  },
};

const ANALYSIS_TEXTS = [
  'Fehlercode wird ausgewertet',
  'Mögliche Ursachen werden geprüft',
  'Lösungsschritte werden vorbereitet',
];

const STATIC_FALLBACK_FIXES: AutoFix[] = [
  { label: 'Cache leeren & neu laden', action: 'localStorage_clear', description: 'Löscht den lokalen Speicher und lädt die Seite neu.' },
  { label: 'Seite neu laden', action: 'session_reload', description: 'Lädt die aktuelle Seite komplett neu.' },
  { label: 'App zurücksetzen', action: 'state_reset', description: 'Setzt alle App-Einstellungen auf Standard zurück.' },
];

export default function ErrorPage({ type, error }: ErrorPageProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

  // Diagnosis state
  const [diagPhase, setDiagPhase] = useState<'idle' | 'loading' | 'result' | 'fallback'>('idle');
  const [diagResult, setDiagResult] = useState<DiagnosisResult | null>(null);
  const [analysisIdx, setAnalysisIdx] = useState(0);
  const [executedFixes, setExecutedFixes] = useState<Set<string>>(new Set());
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showManualSteps, setShowManualSteps] = useState(false);

  const c = textConfig[type];
  const now = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const errorDetails = useMemo(() => ({
    message: error?.message || null,
    stack: error?.stack || null,
    code: (error as any)?.code || (type === 'crash' ? '500' : type === '404' ? '404' : type === 'unauthorized' ? '403' : null),
    type,
    page_url: window.location.href,
    user_agent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    raw_error_string: error?.message
      ? `${error.message}${error.stack ? '\n\n' + error.stack : ''}`
      : null,
  }), [type, error]);

  const handleHomeClick = useCallback(async () => {
    setRedirecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      window.location.href = session ? '/' : '/auth';
    } catch {
      window.location.href = '/auth';
    }
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(3);
    let n = 3;
    const iv = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(iv);
        window.location.reload();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, []);

  const executeFix = useCallback(async (fix: AutoFix) => {
    setExecutedFixes(prev => new Set(prev).add(fix.action));

    switch (fix.action) {
      case 'localStorage_clear':
        localStorage.clear();
        sessionStorage.clear();
        toast.success('Cache geleert');
        startCountdown();
        break;
      case 'session_reload':
        window.location.reload();
        break;
      case 'cache_clear':
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        toast.success('Browser Cache geleert');
        startCountdown();
        break;
      case 'state_reset':
        localStorage.removeItem('dashboard-layout');
        localStorage.removeItem('timer-state');
        localStorage.removeItem('microlearning-index');
        localStorage.removeItem('microlearning-date');
        localStorage.removeItem('sidebar-state');
        localStorage.removeItem('theme');
        toast.success('App-Status zurückgesetzt');
        startCountdown();
        break;
      case 'auth_retry':
        toast.success('Sitzung zurückgesetzt — Login wird geöffnet...');
        await supabase.auth.signOut();
        setTimeout(() => { window.location.href = '/auth'; }, 1500);
        break;
    }
  }, [startCountdown]);

  const startDiagnosis = useCallback(async () => {
    setDiagPhase('loading');
    setAnalysisIdx(0);

    // Cycle analysis text
    const textInterval = setInterval(() => {
      setAnalysisIdx(prev => (prev + 1) % ANALYSIS_TEXTS.length);
    }, 600);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('diagnose-error', {
        body: {
          errorType: type,
          errorCode: errorDetails.code,
          errorMessage: errorDetails.message,
          errorStack: errorDetails.stack,
          pageUrl: errorDetails.page_url,
          userAgent: errorDetails.user_agent,
        },
      });

      clearTimeout(timeout);
      clearInterval(textInterval);

      if (fnError || data?.error) {
        console.error('Diagnosis error:', fnError || data?.error);
        setDiagPhase('fallback');
        return;
      }

      setDiagResult(data as DiagnosisResult);
      setDiagPhase('result');
    } catch (e) {
      console.error('Diagnosis failed:', e);
      clearTimeout(timeout);
      clearInterval(textInterval);
      setDiagPhase('fallback');
    }
  }, [type, errorDetails]);

  const severityConfig = {
    high: { label: 'Kritisch', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    medium: { label: 'Mittel', className: 'bg-warning/10 text-warning border-warning/20' },
    low: { label: 'Niedrig', className: 'bg-success/10 text-success border-success/20' },
  };

  const renderFixList = (fixes: AutoFix[]) => (
    <div className="flex flex-col gap-2">
      {fixes.map((fix) => (
        <div key={fix.action} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Wrench className="h-3.5 w-3.5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground">{fix.label}</p>
            <p className="text-[11px] text-muted-foreground">{fix.description}</p>
          </div>
          <Button
            size="sm"
            variant={executedFixes.has(fix.action) ? 'ghost' : 'outline'}
            className={`shrink-0 text-xs h-7 px-3 ${executedFixes.has(fix.action) ? 'text-success' : 'text-primary border-primary/30 hover:bg-primary/10'}`}
            disabled={executedFixes.has(fix.action) || countdown !== null}
            onClick={() => executeFix(fix)}
          >
            {executedFixes.has(fix.action) ? (
              <><Check className="h-3 w-3 mr-1" /> Ausgeführt</>
            ) : (
              'Ausführen'
            )}
          </Button>
        </div>
      ))}
    </div>
  );

  const renderDiagnosisPanel = () => {
    if (diagPhase === 'loading') {
      return (
        <div className="w-full rounded-lg border-l-[3px] border-l-primary bg-accent p-4 text-left">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <span className="text-sm font-medium text-foreground">KI analysiert den Fehler...</span>
          </div>
          <p className="text-xs text-muted-foreground ml-7">{ANALYSIS_TEXTS[analysisIdx]}</p>
        </div>
      );
    }

    if (diagPhase === 'fallback') {
      return (
        <div className="w-full rounded-lg border-l-[3px] border-l-muted-foreground bg-accent p-4 text-left space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Automatische Diagnose nicht verfügbar</p>
            <p className="text-xs text-muted-foreground">KI-Analyse konnte nicht gestartet werden.</p>
          </div>
          {renderFixList(STATIC_FALLBACK_FIXES)}
          <button
            onClick={() => setSupportOpen(true)}
            className="text-xs text-primary hover:underline bg-transparent border-none cursor-pointer"
          >
            Support kontaktieren →
          </button>
        </div>
      );
    }

    if (diagPhase === 'result' && diagResult) {
      const sev = severityConfig[diagResult.severity] || severityConfig.medium;
      return (
        <div className="w-full rounded-lg border-l-[3px] border-l-primary bg-accent p-4 text-left space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${sev.className}`}>
              {sev.label}
            </span>
            <span className="text-[13px] text-muted-foreground">KI Diagnose</span>
          </div>

          {/* Diagnosis */}
          <p className="text-sm text-foreground leading-relaxed">{diagResult.diagnosis}</p>
          <p className="text-xs text-muted-foreground italic">Wahrscheinliche Ursache: {diagResult.likely_cause}</p>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Auto fixes */}
          {diagResult.auto_fixes.length > 0 && renderFixList(diagResult.auto_fixes)}

          {/* Manual steps */}
          {diagResult.manual_steps.length > 0 && (
            <>
              <div className="border-t border-border" />
              <button
                onClick={() => setShowManualSteps(!showManualSteps)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${showManualSteps ? 'rotate-90' : ''}`} />
                Manuelle Lösungsschritte anzeigen
              </button>
              {showManualSteps && (
                <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground pl-1">
                  {diagResult.manual_steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
            </>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">Problem weiterhin vorhanden?</span>
            <button
              onClick={() => setSupportOpen(true)}
              className="text-[11px] text-primary hover:underline bg-transparent border-none cursor-pointer"
            >
              Support kontaktieren →
            </button>
          </div>

          {/* Countdown */}
          {countdown !== null && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Seite lädt neu in {countdown}...
              </p>
              <div className="h-0.5 w-full bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${((3 - countdown) / 3) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center text-center max-w-sm">
        {c.code && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-card border border-border text-muted-foreground mb-4">
            {c.code}
          </span>
        )}

        <div className="mb-6">{icons[type]}</div>

        <h1 className="text-xl font-semibold text-foreground mb-2">{c.heading}</h1>
        <p className="text-sm text-muted-foreground mb-6">{c.subtext}</p>

        {type === 'crash' && error?.message && (
          <div className="w-full mb-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto"
            >
              Fehlerdetails anzeigen
              {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {showDetails && (
              <pre className="mt-2 text-[11px] text-left bg-card border border-border rounded-lg p-3 max-h-[120px] overflow-y-auto text-destructive break-all whitespace-pre-wrap">
                {error.message}
              </pre>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full max-w-[280px]">
          <Button onClick={handleHomeClick} className="w-full" disabled={redirecting}>
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            ← Zur Startseite
          </Button>
          <Button variant="outline" onClick={c.secondaryAction} className="w-full">{c.secondaryLabel}</Button>

          {/* KI Diagnose Button */}
          {diagPhase === 'idle' && (
            <Button
              onClick={startDiagnosis}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              KI Diagnose starten
            </Button>
          )}

          {/* Diagnosis Panel */}
          {diagPhase !== 'idle' && renderDiagnosisPanel()}

          <button
            onClick={() => setSupportOpen(true)}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 cursor-pointer bg-transparent border-none"
          >
            Support kontaktieren
          </button>
        </div>

        <div className="mt-10 text-[11px] text-muted-foreground/60">
          <p>Agency Hub · Haush Haush × Viral Connect</p>
          {type === 'crash' && <p className="mt-0.5">Fehler aufgetreten: {now}</p>}
        </div>
      </div>

      <SupportModal
        open={supportOpen}
        onClose={() => setSupportOpen(false)}
        errorType={type}
        error={error}
        errorDetails={errorDetails}
      />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
        .animate-float { animation: float 3s ease-in-out infinite; }
      `}</style>
    </div>
  );
}
