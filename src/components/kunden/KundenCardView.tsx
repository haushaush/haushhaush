import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';

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
      className="h-[180px] overflow-hidden"
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
            className="text-white/90 font-heading font-bold text-center leading-tight truncate"
            style={{ fontSize: label.length > 12 ? '0.8rem' : label.length > 6 ? '0.95rem' : '1.15rem' }}
          >
            {label}
          </span>
        </div>
      )}
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {deals.length === 0 ? (
        <p className="col-span-full text-center text-muted-foreground py-12">Keine Kunden gefunden</p>
      ) : deals.map(d => {
        const ks = d.kundenstatus || '–';
        const company = d.unternehmen || '';
        const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ') || '–';

        return (
          <Card
            key={d.id}
            className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all overflow-hidden p-0"
            onClick={() => onSelect(d)}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(d)}
            role="button"
          >
            <CompanyHeader company={company} clientName={d.client_name} logos={logos} />
            <div className="px-3 py-2.5 space-y-1.5">
              <p className="font-semibold text-sm truncate">{d.client_name}</p>
              <Badge variant="secondary" className={`text-[10px] rounded-[4px] ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>
                {ks}
              </Badge>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{dateRange}</span>
                <span className="font-medium text-foreground tabular-nums">{fmt(d.gesamt_saldo ?? d.wert_eur)}</span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
