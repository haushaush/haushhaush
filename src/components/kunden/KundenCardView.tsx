import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

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

const COMPANY_BG: Record<string, string> = {
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

function CompanyHeader({ company, clientName }: { company: string; clientName: string }) {
  const bg = COMPANY_BG[company] || '#374151';
  const label = company || clientName?.charAt(0)?.toUpperCase() || '?';

  return (
    <div
      className="h-20 flex items-center justify-center px-4"
      style={{ background: bg }}
    >
      <span
        className="text-white/90 font-heading font-bold text-center leading-tight truncate"
        style={{ fontSize: label.length > 12 ? '0.8rem' : label.length > 6 ? '0.95rem' : '1.15rem' }}
      >
        {label}
      </span>
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
