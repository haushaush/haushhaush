import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

interface WebsiteEmbedProps {
  url: string;
  title?: string;
  fallbackImageUrl?: string | null;
  height?: number | string;
}

/** Full-size, fully-interactive iframe embed with fallback. */
export function WebsiteEmbed({ url, title, fallbackImageUrl, height = 700 }: WebsiteEmbedProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'blocked'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setStatus('loading');
    const timer = setTimeout(() => {
      setStatus(prev => (prev === 'loading' ? 'blocked' : prev));
    }, 8000);
    return () => clearTimeout(timer);
  }, [url]);

  // Fallback: blocked + fallback image available
  if (status === 'blocked' && fallbackImageUrl) {
    return (
      <div className="relative bg-muted rounded-lg overflow-hidden border border-border">
        <img src={fallbackImageUrl} alt={title ?? ''} className="w-full block" />
        <div className="absolute top-3 right-3 bg-amber-500 text-white text-xs px-2 py-1 rounded font-medium">
          📸 Vorschau
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex justify-center">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 bg-background shadow-lg px-4 py-2 rounded text-sm font-medium hover:bg-muted transition"
          >
            <ExternalLink className="w-4 h-4" /> Live öffnen
          </a>
        </div>
      </div>
    );
  }

  // Blocked + no fallback
  if (status === 'blocked' && !fallbackImageUrl) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-900 rounded-lg p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="font-semibold mb-2">Diese Website blockiert das Embedden</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
          Manche Websites (Banken, Versicherer) erlauben kein Embedden in iFrames.
          Lade ein Fallback-Bild hoch oder öffne die Seite im neuen Tab.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded text-sm hover:opacity-90 transition"
        >
          <ExternalLink className="w-4 h-4" /> Im neuen Tab öffnen
        </a>
      </div>
    );
  }

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
        ref={iframeRef}
        src={url}
        title={title || url}
        className="w-full h-full border-0 block"
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('blocked')}
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
      {/* Overlay to block any iframe interaction inside card */}
      <div className="absolute inset-0" />
    </div>
  );
}
