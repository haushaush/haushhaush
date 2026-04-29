import { useEffect, useRef, useState } from 'react';

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

export function WebsiteEmbed({ website, height = 600 }: Props) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const fallbackImg = website.screenshot_url || website.preview_image_url || '/placeholder.svg';

  useEffect(() => {
    if (!website.website_url || website.embed_method === 'screenshot' || website.embed_method === 'manual') {
      setShowFallback(true);
      return;
    }
    setShowFallback(false);
    setIframeLoaded(false);
    const timer = setTimeout(() => {
      if (!iframeLoaded) setShowFallback(true);
    }, 4000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.website_url, website.embed_method]);

  if (showFallback) {
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
    <div className="relative rounded-lg overflow-hidden border border-border">
      <iframe
        src={website.website_url ?? ''}
        title={website.title ?? 'Website'}
        className="w-full bg-white"
        style={{ height }}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer"
        onLoad={() => setIframeLoaded(true)}
      />
      <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[11px] px-2 py-0.5 rounded">
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

/** Grid card scaled iframe preview */
export function WebsiteCardPreview({ website, height = 180 }: Props) {
  const fallbackImg = website.screenshot_url || website.preview_image_url || '/placeholder.svg';
  if (website.embed_method === 'iframe' && website.website_url) {
    return (
      <div className="relative w-full overflow-hidden bg-muted" style={{ height }}>
        <iframe
          src={website.website_url}
          title={website.title ?? ''}
          className="absolute top-0 left-0 pointer-events-none border-0"
          style={{
            width: '200%',
            height: `${height * (1 / 0.5)}px`,
            transform: 'scale(0.5)',
            transformOrigin: 'top left',
          }}
          sandbox="allow-scripts allow-same-origin"
          loading="lazy"
        />
        <div className="absolute inset-0" />
      </div>
    );
  }
  return (
    <img
      src={fallbackImg}
      alt={website.title ?? ''}
      className="w-full object-cover"
      style={{ height }}
    />
  );
}
