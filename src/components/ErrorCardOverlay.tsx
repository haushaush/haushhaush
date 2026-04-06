import { useState } from 'react';
import { AlertTriangle, X, Copy, Check, Sparkles } from 'lucide-react';
import { useErrorContext } from '@/contexts/ErrorContext';

export function ErrorCardOverlay() {
  const { errorCards, dismissErrorCard } = useErrorContext();
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  if (errorCards.length === 0) return null;

  const copyError = (card: typeof errorCards[0]) => {
    const text = [
      `Fehlercode: ${card.code}`,
      `Nachricht: ${card.message}`,
      card.source ? `Quelle: ${card.source}` : '',
      `Zeit: ${card.timestamp.toLocaleTimeString('de-DE')}`,
      card.stack ? `\nStack:\n${card.stack.slice(0, 500)}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(card.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const copyPrompt = (card: typeof errorCards[0]) => {
    const text = `Fix this error in the Agency Hub dashboard:\n\nCode: ${card.code}\nMessage: ${card.message}\nSource: ${card.source || 'unknown'}\n\nPlease investigate and fix without breaking other functionality.`;
    navigator.clipboard.writeText(text);
    setCopiedPrompt(card.id);
    setTimeout(() => setCopiedPrompt(null), 1500);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 9500,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 400,
        width: 'calc(100vw - 280px - 40px)',
      }}
    >
      {errorCards.map(card => (
        <div
          key={card.id}
          className="bg-card border border-destructive/30 rounded-xl shadow-lg"
          style={{
            padding: '14px 16px',
            animation: 'errorCardSlideIn 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Top row */}
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-[11px] font-mono font-semibold text-destructive px-1.5 py-0.5 rounded bg-destructive/10">
              {card.code}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto mr-2">
              {card.timestamp.toLocaleTimeString('de-DE')}
            </span>
            <button
              onClick={() => dismissErrorCard(card.id)}
              className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Message */}
          <p className="text-[13px] text-foreground leading-relaxed mb-3">
            {card.message.slice(0, 200)}
            {card.message.length > 200 && '...'}
          </p>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => copyError(card)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
            >
              {copied === card.id
                ? <><Check className="h-3 w-3" /> Kopiert!</>
                : <><Copy className="h-3 w-3" /> Fehler kopieren</>
              }
            </button>
            <button
              onClick={() => copyPrompt(card)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all cursor-pointer"
            >
              {copiedPrompt === card.id
                ? <><Check className="h-3 w-3" /> Kopiert!</>
                : <><Sparkles className="h-3 w-3" /> Lovable Prompt</>
              }
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
