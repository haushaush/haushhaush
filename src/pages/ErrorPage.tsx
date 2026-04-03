import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import SupportModal from '@/components/SupportModal';

interface ErrorPageProps {
  type: '404' | 'crash' | 'unauthorized' | 'offline';
  error?: Error | null;
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

export default function ErrorPage({ type, error }: ErrorPageProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);

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
