import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FileX } from 'lucide-react';

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const AMPEL_MAP: Record<string, { dot: string; label: string }> = {
  'AA': { dot: 'bg-success', label: 'AA' },
  'A': { dot: 'bg-success', label: 'A' },
  'Grün': { dot: 'bg-success', label: 'A' },
  'BB': { dot: 'bg-warning', label: 'BB' },
  'B': { dot: 'bg-warning', label: 'B' },
  'Gelb': { dot: 'bg-warning', label: 'B' },
  'CC': { dot: 'bg-destructive', label: 'CC' },
  'C': { dot: 'bg-destructive', label: 'C' },
  'Rot': { dot: 'bg-destructive', label: 'C' },
};

const FALLBACK_BG: Record<string, string> = {
  "Allianz": "#003781",
  "Hanse Merkur": "#004B2D",
  "Barmenia Gothaer": "#1a1a1a",
  "Signal Iduna": "#E20028",
  "AXA": "#00208C",
  "ARAG": "#004A99",
  "ERGO": "#1D1D1B",
  "Versicherungsmakler": "#0A3055",
  "Individuell": "#374151",
};

interface CompanyLogo {
  unternehmen: string;
  logo_url: string | null;
  bg_color: string | null;
}

let cachedLogos: CompanyLogo[] | null = null;

function CompanyHeader({ company, clientName, logos }: { company: string; clientName: string; logos: CompanyLogo[] }) {
  const entry = logos.find(l => l.unternehmen === company);
  const bg = entry?.bg_color || FALLBACK_BG[company] || '#374151';
  const logoUrl = entry?.logo_url;
  const label = company || clientName?.charAt(0)?.toUpperCase() || '?';
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className="h-[140px] overflow-hidden relative"
      style={{ background: logoUrl && !imgFailed ? undefined : bg }}
    >
      {logoUrl && !imgFailed ? (
        <img
          src={logoUrl}
          alt={company}
          className="w-full h-full object-cover object-center"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center px-4">
          <span
            className="text-white/80 font-heading font-bold text-center leading-tight truncate"
            style={{ fontSize: label.length > 12 ? '0.75rem' : label.length > 6 ? '0.9rem' : '1.1rem' }}
          >
            {label}
          </span>
        </div>
      )}
      {/* Gradient overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/30 to-transparent" />
    </div>
  );
}

interface KundenCardViewProps {
  deals: any[];
  onSelect: (deal: any) => void;
}

export default function KundenCardView({ deals, onSelect }: KundenCardViewProps) {
  const [logos, setLogos] = useState<CompanyLogo[]>(cachedLogos || []);

  useEffect(() => {
    if (cachedLogos) return;
    supabase.from('company_logos').select('*').then(({ data }) => {
      const result = (data as any[] || []) as CompanyLogo[];
      cachedLogos = result;
      setLogos(result);
    });
  }, []);

  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
          <FileX className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Keine Kunden gefunden</p>
        <p className="text-xs text-muted-foreground max-w-[240px]">Passe deine Filter an oder importiere Kunden aus Notion.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {deals.map(d => {
        const ks = d.kundenstatus || '–';
        const company = d.unternehmen || '';
        const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ');
        const ampelRaw = d.ampel || d.ampelstatus || '';
        const ampel = AMPEL_MAP[ampelRaw];
        const saldo = d.gesamt_saldo ?? d.wert_eur;

        return (
          <div
            key={d.id}
            className="group bg-card border border-border/50 rounded-xl overflow-hidden cursor-pointer hover:border-primary/30 hover:shadow-md transition-all duration-200"
            onClick={() => onSelect(d)}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(d)}
            role="button"
          >
            <CompanyHeader company={company} clientName={d.client_name} logos={logos} />
            <div className="px-3.5 py-3 space-y-2.5">
              {/* Name + Ampel */}
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-sm truncate flex-1">{d.client_name}</p>
                {ampel && (
                  <span className="flex items-center gap-1 shrink-0 mt-0.5">
                    <span className={`h-2 w-2 rounded-full ${ampel.dot}`} />
                    <span className="text-[10px] font-medium text-muted-foreground">{ampel.label}</span>
                  </span>
                )}
              </div>

              {/* Status + Saldo row */}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>
                  {ks}
                </span>
                <span className="font-bold text-sm tabular-nums font-mono">{fmt(saldo)}</span>
              </div>

              {/* Date */}
              {dateRange && (
                <p className="text-[11px] text-muted-foreground/70">{dateRange}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
