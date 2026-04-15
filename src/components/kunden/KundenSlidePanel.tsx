import { useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, ExternalLink, Mail, Phone, Globe, AlertTriangle } from 'lucide-react';

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
  'Grün': { dot: 'bg-success', label: 'Grün' },
  'BB': { dot: 'bg-warning', label: 'BB' },
  'B': { dot: 'bg-warning', label: 'B' },
  'Gelb': { dot: 'bg-warning', label: 'Gelb' },
  'CC': { dot: 'bg-destructive', label: 'CC' },
  'C': { dot: 'bg-destructive', label: 'C' },
  'Rot': { dot: 'bg-destructive', label: 'Rot' },
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
  try { return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
};

interface KundenSlidePanelProps {
  deal: any;
  onClose: () => void;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-sm">{children || <span className="text-muted-foreground">–</span>}</span>
    </div>
  );
}

function FinanceRow({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{fmt(value)}</span>
    </div>
  );
}

export default function KundenSlidePanel({ deal: d, onClose }: KundenSlidePanelProps) {
  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [handleEsc]);

  const ks = d.kundenstatus || '–';
  const ampelRaw = d.ampel || d.ampelstatus || '';
  const ampel = AMPEL_MAP[ampelRaw] || { dot: 'bg-muted', label: ampelRaw || '–' };
  const company = d.unternehmen || '';
  const bgClass = COMPANY_COLORS[company] || 'bg-muted';
  const branche = Array.isArray(d.branche) ? d.branche : d.art ? [d.art] : [];
  const projekttyp = Array.isArray(d.projekttyp) ? d.projekttyp : Array.isArray(d.leistungen) ? d.leistungen : [];
  const dateRange = [fmtDate(d.start_datum), fmtDate(d.end_datum)].filter(Boolean).join(' – ') || '–';

  return (
    <div className="fixed inset-0 z-[400] flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full sm:w-[50vw] sm:min-w-[420px] bg-background shadow-2xl animate-slide-in-right overflow-y-auto">
        {/* Header with company color */}
        <div className={`${bgClass} px-6 pt-6 pb-8 relative`}>
          <div className="flex items-start justify-between">
            <span className="text-white/70 text-xs font-medium tracking-wide uppercase">
              {company || 'Unbekannt'}
            </span>
            <div className="flex gap-2">
              {d.notion_url && (
                <a
                  href={d.notion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                >
                  <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10 h-8">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                    In Notion öffnen
                  </Button>
                </a>
              )}
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white p-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <h2 className="text-xl font-heading font-bold text-white mt-3">{d.client_name}</h2>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className={`text-xs ${STATUS_STYLES[ks] || 'bg-white/20 text-white'}`}>
              {ks}
            </Badge>
            <span className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${ampel.dot}`} />
              <span className="text-xs font-medium text-white/80">{ampel.label}</span>
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info section */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Kontakt & Info</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoRow label="Vor- & Nachname">{d.vor_nachname}</InfoRow>
              <InfoRow label="Email">
                {d.email ? (
                  <a href={`mailto:${d.email}`} className="text-primary hover:underline flex items-center gap-1">
                    <Mail className="h-3 w-3" />{d.email}
                  </a>
                ) : null}
              </InfoRow>
              <InfoRow label="Telefon">
                {d.telefon ? (
                  <a href={`tel:${d.telefon}`} className="text-primary hover:underline flex items-center gap-1">
                    <Phone className="h-3 w-3" />{d.telefon}
                  </a>
                ) : null}
              </InfoRow>
              <InfoRow label="Website">
                {d.website_url ? (
                  <a href={d.website_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 truncate">
                    <Globe className="h-3 w-3 flex-shrink-0" /><span className="truncate">{d.website_url}</span>
                  </a>
                ) : null}
              </InfoRow>
              <InfoRow label="Unternehmen">{d.unternehmen}</InfoRow>
              <InfoRow label="Branche">
                {branche.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {branche.map((b: string) => <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>)}
                  </div>
                ) : null}
              </InfoRow>
              <InfoRow label="Projekttyp">
                {projekttyp.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {projekttyp.map((p: string) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                  </div>
                ) : null}
              </InfoRow>
              <InfoRow label="Laufzeit">{d.laufzeit}</InfoRow>
              <InfoRow label="Zeitraum">{dateRange}</InfoRow>
              <InfoRow label="Deadline">{fmtDate(d.deadline)}</InfoRow>
            </div>
          </section>

          {/* Finanzen section */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Finanzen</h3>
            <div className="bg-muted/30 rounded-lg p-4">
              <FinanceRow label="Gesamt-Saldo" value={d.gesamt_saldo ?? d.wert_eur} />
              <FinanceRow label="Ads-Budget" value={d.ads_budget} />
              <FinanceRow label="Cash Collect offen" value={d.cash_collect_offen} />
              <FinanceRow label="CLV" value={d.clv} />
              <FinanceRow label="Meta Kosten" value={d.meta_kosten} />
              <FinanceRow label="CRM Kosten" value={d.crm_kosten} />
              <FinanceRow label="Superchat Kosten" value={d.superchat_kosten} />
              <FinanceRow label="Website Kosten" value={d.website_kosten} />
              <div className="flex items-center justify-between py-1.5 mt-1">
                <span className="text-sm text-muted-foreground">Zahlstatus</span>
                {d.zahlstatus ? (
                  <Badge variant="outline" className="text-[10px]">{d.zahlstatus}</Badge>
                ) : <span className="text-sm text-muted-foreground">–</span>}
              </div>
            </div>
          </section>

          {/* Status section */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Status</h3>
            <div className="space-y-3">
              {d.laufzeit_in_14t && (
                <div className="flex items-center gap-2 bg-warning/10 text-warning rounded-md px-3 py-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">Laufzeit in 14 Tagen fällig</span>
                </div>
              )}
              {d.notion_url && (
                <a
                  href={d.notion_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="w-full">
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    In Notion öffnen
                  </Button>
                </a>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
