import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WebsiteEmbedProps {
  url: string;
  title?: string;
  fallbackImageUrl?: string | null;
  height?: number | string;
  /** If provided, will persist iframe-blocked status to DB via edge function. */
  showcaseId?: string;
  /** Initial known blocked state from DB (true = blocked, false = ok, null/undefined = unknown). */
  initialIsBlocked?: boolean | null;
  /** Whether DB has already checked this URL. */
  hasChecked?: boolean;
}

/** Full-size, fully-interactive iframe embed with smart fallback. */
export function WebsiteEmbed({
  url,
  title,
  fallbackImageUrl,
  height = 700,
  showcaseId,
  initialIsBlocked,
  hasChecked,
}: WebsiteEmbedProps) {
  const [showFallback, setShowFallback] = useState(initialIsBlocked === true);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'blocked'>(
    initialIsBlocked === true ? 'blocked' : 'loading'
  );
  const iframeLoadedRef = useRef(false);
  const checkedRef = useRef(!!hasChecked);

  // Background check (one-time per mount) if never checked.
  useEffect(() => {
    if (!showcaseId || checkedRef.current) return;
    checkedRef.current = true;
    supabase.functions
      .invoke('check-website-embeddable', {
        body: { showcase_id: showcaseId, url },
      })
      .then(({ data }) => {
        if (data?.is_blocked) {
          setShowFallback(true);
          setStatus('blocked');
        }
      })
      .catch(() => {});
  }, [showcaseId, url]);

  // Timeout fallback: if iframe doesn't fire load within 5s, assume blocked.
  useEffect(() => {
    if (showFallback) return;
    const t = setTimeout(() => {
      if (!iframeLoadedRef.current) {
        setShowFallback(true);
        setStatus('blocked');
      }
    }, 5000);
    return () => clearTimeout(t);
  }, [showFallback, url]);

  // FALLBACK MODE
  if (showFallback) {
    if (fallbackImageUrl) {
      return (
        <div
          className="relative bg-muted rounded-lg overflow-hidden border border-border"
          style={{ height: typeof height === 'number' ? `${height}px` : height }}
        >
          <img
            src={fallbackImageUrl}
            alt={title ?? ''}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute top-3 right-3 bg-amber-500 text-white text-xs px-2 py-1 rounded font-medium shadow">
            📸 Vorschau
          </div>
        </div>
      );
    }

    // No fallback image — clean empty state instead of browser error
    return (
      <div
        className="flex flex-col items-center justify-center text-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border border-border p-8"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        <ImageIcon className="w-10 h-10 text-gray-400 dark:text-gray-600 mb-3" />
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
          Vorschau nicht verfügbar
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
          Diese Website blockiert das Embedden. Öffne sie im neuen Tab, um sie zu sehen.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded text-sm hover:opacity-90 transition"
        >
          <ExternalLink className="w-4 h-4" /> Website besuchen
        </a>
      </div>
    );
  }

  // NORMAL MODE: iframe
  return (
    <div
      className="relative rounded-lg overflow-hidden border border-border bg-white"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/60 z-10">
          <div className="text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground mt-2">Lade Website...</p>
          </div>
        </div>
      )}

      <iframe
        src={url}
        title={title || url}
        className="w-full h-full border-0 block"
        loading="lazy"
        onLoad={() => {
          iframeLoadedRef.current = true;
          setStatus('loaded');
        }}
        onError={() => {
          setShowFallback(true);
          setStatus('blocked');
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer-when-downgrade"
        allow="accelerometer; camera; gyroscope; microphone; payment"
      />

      {status === 'loaded' && (
        <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-[11px] px-2 py-1 rounded font-medium pointer-events-none">
          ⚡ Live
        </div>
      )}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 bg-background shadow-lg px-3 py-1.5 rounded text-xs font-medium hover:bg-muted transition flex items-center gap-1"
      >
        <ExternalLink className="w-3 h-3" /> Vollbild
      </a>
    </div>
  );
}

interface CardPreviewProps {
  url?: string | null;
  fallbackImageUrl?: string | null;
  title?: string | null;
  height?: number;
}

/** Grid-card preview: scaled non-interactive iframe, or fallback image. */
export function WebsiteCardPreview({ url, fallbackImageUrl, title, height = 200 }: CardPreviewProps) {
  if (fallbackImageUrl) {
    return (
      <img
        src={fallbackImageUrl}
        alt={title ?? ''}
        className="w-full object-cover object-top"
        style={{ height }}
        loading="lazy"
      />
    );
  }

  if (!url) {
    return (
      <div
        className="w-full bg-muted flex items-center justify-center text-xs text-muted-foreground"
        style={{ height }}
      >
        Keine Vorschau
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden bg-muted" style={{ height }}>
      <iframe
        src={url}
        title={title ?? url}
        className="border-0 pointer-events-none"
        style={{
          width: '1280px',
          height: '800px',
          transform: 'scale(0.25)',
          transformOrigin: 'top left',
        }}
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
        loading="lazy"
      />
      <div className="absolute inset-0" />
    </div>
  );
}
