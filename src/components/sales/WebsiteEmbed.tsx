import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface Website {
  id?: string | null;
  website_url?: string | null;
  embed_method?: string | null;
  screenshot_url?: string | null;
  preview_image_url?: string | null;
  title?: string | null;
}

const LIVE_PORTAL_HOST = 'haushhaush.lovable.app';

function detectLovableEditor(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  if (host === LIVE_PORTAL_HOST) return false;
  if (host.includes('lovable.dev')) return true;
  // id-preview--*.lovable.app or any non-live host inside an iframe (editor preview)
  if (host.endsWith('.lovable.app') && host !== LIVE_PORTAL_HOST) return true;
  try {
    if (window.parent !== window) return true;
  } catch {
    return true;
  }
  return false;
}

interface Props {
  website: Website;
  height?: number;
}

export function WebsiteEmbed({ website, height = 700 }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  useEffect(() => {
    if (website.embed_method !== 'iframe') return;
    setIframeLoaded(false);
    setIframeBlocked(false);
    const timer = setTimeout(() => {
      if (!iframeLoaded) setIframeBlocked(true);
    }, 5000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.website_url, website.embed_method]);

  const fallbackImg = website.screenshot_url || website.preview_image_url || '/placeholder.svg';
  const isInLovableEditor = detectLovableEditor();

  // Editor preview can't embed other Lovable projects (service-worker conflict).
  // Show screenshot + warning + link to live portal instead.
  if (website.embed_method === 'iframe' && isInLovableEditor && website.website_url) {
    const livePortalUrl = website.id
      ? `https://${LIVE_PORTAL_HOST}/sales/referenz-showcase/websites/${website.id}`
      : website.website_url;
    return (
      <div className="relative rounded-lg overflow-hidden border border-border bg-muted">
        <img
          src={fallbackImg}
          alt={website.title ?? ''}
          className="w-full object-cover"
          style={{ maxHeight: height }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4">
          <div className="bg-background border border-border px-6 py-5 rounded-lg shadow-xl max-w-md text-center">
            <p className="font-semibold mb-2 text-sm">⚡ Live-Embed im Editor deaktiviert</p>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Lovable's Editor-Vorschau kann andere Lovable-Projekte nicht korrekt
              embedden (Service-Worker-Konflikt). Das Live-Portal zeigt das Embed
              korrekt an.
            </p>
            <a
              href={livePortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded text-xs font-medium hover:opacity-90 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Im Live-Portal öffnen
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (website.embed_method !== 'iframe' || iframeBlocked || !website.website_url) {
    return (
      <div className="relative bg-muted rounded-lg overflow-hidden">
        <img
          src={fallbackImg}
          alt={website.title ?? ''}
          className="w-full object-cover"
          style={{ maxHeight: height }}
        />
        <div className="absolute top-2 right-2 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded">
          📸 Screenshot
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden border border-border bg-white">
      <iframe
        src={website.website_url}
        title={website.title ?? 'Website'}
        className="w-full block"
        style={{ height, pointerEvents: 'none' }}
        loading="lazy"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        scrolling="no"
        onLoad={() => setIframeLoaded(true)}
      />

      {/* Click overlay — opens real site in new tab */}
      <div
        className="absolute inset-0 cursor-pointer group"
        onClick={() => window.open(website.website_url!, '_blank', 'noopener,noreferrer')}
      >
        <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all">
          <div className="opacity-0 group-hover:opacity-100 bg-background/95 backdrop-blur px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-all">
            <ExternalLink className="w-4 h-4" />
            <span className="text-sm font-medium">Live-Vorschau · Klicken zum Öffnen</span>
          </div>
        </div>
      </div>

      <div className="absolute top-3 right-3 bg-primary text-primary-foreground text-[11px] px-2 py-1 rounded font-medium pointer-events-none">
        ⚡ Live
      </div>
    </div>
  );
}

/** Tries to detect if a URL can be embedded in an iframe. */
export function testIframeEmbed(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '100px';
    iframe.style.height = '100px';
    iframe.sandbox.add('allow-scripts', 'allow-same-origin');

    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      try { iframe.remove(); } catch {}
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    iframe.addEventListener('load', () => {
      clearTimeout(timeout);
      cleanup();
      resolve(true);
    });
    iframe.addEventListener('error', () => {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    });

    document.body.appendChild(iframe);
  });
}

/** Grid card preview — ALWAYS uses screenshot (faster, more reliable, no iframe quirks) */
export function WebsiteCardPreview({ website, height = 180 }: Props) {
  const fallbackImg = website.screenshot_url || website.preview_image_url || '/placeholder.svg';
  return (
    <img
      src={fallbackImg}
      alt={website.title ?? ''}
      className="w-full object-cover"
      style={{ height }}
      loading="lazy"
    />
  );
}
