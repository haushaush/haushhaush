import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const COMPANY_STYLES: Record<string, { bg: string; logo: string | null }> = {
  "Allianz": {
    bg: "#003781",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Allianz_logo.svg/320px-Allianz_logo.svg.png"
  },
  "Hanse Merkur": {
    bg: "#004B2D",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/HanseMerkur_logo.svg/320px-HanseMerkur_logo.svg.png"
  },
  "Barmenia Gothaer": {
    bg: "#1a1a1a",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Barmenia_logo.svg/320px-Barmenia_logo.svg.png"
  },
  "Signal Iduna": {
    bg: "#E20028",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Signal_Iduna_logo.svg/320px-Signal_Iduna_logo.svg.png"
  },
  "AXA": {
    bg: "#00208C",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/AXA_Logo.svg/320px-AXA_Logo.svg.png"
  },
  "ARAG": {
    bg: "#004A99",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/ARAG_logo.svg/320px-ARAG_logo.svg.png"
  },
  "ERGO": {
    bg: "#1D1D1B",
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Ergo_logo.svg/320px-Ergo_logo.svg.png"
  },
  "Versicherungsmakler": {
    bg: "#0A3055",
    logo: null
  },
};

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

function CompanyHeader({ company, clientName }: { company: string; clientName: string }) {
  const style = COMPANY_STYLES[company];
  const bg = style?.bg || '#374151';
  const logoUrl = style?.logo;
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (company || clientName || '?').charAt(0).toUpperCase();

  return (
    <div
      className="h-20 flex items-center justify-center relative"
      style={{ background: logoUrl && !imgFailed ? bg : `linear-gradient(135deg, ${bg}, ${bg}dd)` }}
    >
      {logoUrl && !imgFailed ? (
        <img
          src={logoUrl}
          alt={company}
          className="max-h-[48px] w-auto object-contain brightness-0 invert"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-white/90 text-2xl font-heading font-bold">{initial}</span>
      )}
    </div>
  );
}

interface KundenCardViewProps {
  deals: any[];
  onSelect: (deal: any) => void;
}

export default function KundenCardView({ deals, onSelect }: KundenCardViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {deals.length === 0 ? (
        <p className="col-span-full text-center text-muted-foreground py-12">Keine Kunden gefunden</p>
      ) : deals.map(d => {
        const ks = d.kundenstatus || '–';
        const company = d.unternehmen || '';
        const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ') || '–';

        return (
          <Card
            key={d.id}
            className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all overflow-hidden"
            onClick={() => onSelect(d)}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onSelect(d)}
            role="button"
          >
            <CompanyHeader company={company} clientName={d.client_name} />
            <CardContent className="p-4 space-y-2">
              <p className="font-semibold text-sm truncate">{d.client_name}</p>
              <Badge variant="secondary" className={`text-[10px] ${STATUS_STYLES[ks] || 'bg-muted text-muted-foreground'}`}>
                {ks}
              </Badge>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>{dateRange}</span>
                <span className="font-medium text-foreground tabular-nums">{fmt(d.gesamt_saldo ?? d.wert_eur)}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
