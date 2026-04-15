import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

const STATUS_STYLES: Record<string, string> = {
  'In Betreuung': 'bg-success/20 text-success',
  'Onboarding': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Follow Up': 'bg-warning/20 text-warning',
  'Done': 'bg-muted text-muted-foreground',
  'Offen': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const COMPANY_COLORS: Record<string, string> = {
  'Allianz': 'bg-[#003781]',
  'Hanse Merkur': 'bg-[#006847]',
  'HanseMerkur': 'bg-[#006847]',
  'AXA': 'bg-[#00008f]',
  'Barmenia Gothaer': 'bg-[#1a1a1a]',
  'Barmenia': 'bg-[#1a1a1a]',
  'Signal Iduna': 'bg-[#003d6a]',
  'Versicherungsmakler': 'bg-[#0a1929]',
  'Individuell': 'bg-[#374151]',
};

const fmt = (v: number | null | undefined) => {
  if (v == null) return '–';
  return `€${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; }
};

interface KundenCardViewProps {
  deals: any[];
}

export default function KundenCardView({ deals }: KundenCardViewProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {deals.length === 0 ? (
        <p className="col-span-full text-center text-muted-foreground py-12">Keine Kunden gefunden</p>
      ) : deals.map(d => {
        const ks = d.kundenstatus || '–';
        const company = d.unternehmen || '';
        const bgClass = COMPANY_COLORS[company] || 'bg-muted';
        const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ') || '–';

        return (
          <Card
            key={d.id}
            className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all overflow-hidden"
            onClick={() => navigate(`/kunden/${d.id}`)}
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && navigate(`/kunden/${d.id}`)}
            role="link"
          >
            <div className={`h-16 ${bgClass} flex items-center justify-center`}>
              <span className="text-white/90 font-heading font-semibold text-sm tracking-wide truncate px-3">
                {company || '–'}
              </span>
            </div>
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
