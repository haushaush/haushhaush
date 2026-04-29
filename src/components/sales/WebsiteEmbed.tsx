import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface Website {
  website_url?: string | null;
  embed_method?: string | null;
  screenshot_url?: string | null;
  preview_image_url?: string | null;
  title?: string | null;
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
