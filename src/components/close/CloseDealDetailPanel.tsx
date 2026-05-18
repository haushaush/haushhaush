import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Mail, Phone, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { CloseLeadDetailPanel } from './CloseLeadDetailPanel';

interface Props {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const dealCache = new Map<string, any>();
const leadCache = new Map<string, any>();
const notesCache = new Map<string, any[]>();

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  won: 'bg-success/20 text-success',
  lost: 'bg-destructive/20 text-destructive',
};

export function CloseDealDetailPanel({ dealId, open, onOpenChange }: Props) {
  const [deal, setDeal] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLead, setShowLead] = useState<string | null>(null);
  const [clientLink, setClientLink] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!open || !dealId) return;
    const cached = dealCache.get(dealId);
    if (cached) {
      setDeal(cached.deal);
      setLead(cached.lead);
      setNotes(cached.notes);
      return;
    }
    setLoading(true);
    setDeal(null); setLead(null); setNotes([]);

    const safeInvoke = async (endpoint: string) => {
      try {
        const { data, error } = await supabase.functions.invoke('close-proxy', {
          body: { endpoint, method: 'GET' },
        });
        if (error) return null;
        return data?.error ? null : data;
      } catch {
        return null;
      }
    };

    (async () => {
      try {
        const dealData = await safeInvoke(`/opportunity/${dealId}/`);
        setDeal(dealData);

        const leadId = dealData?.lead_id;
        let leadData = null;
        let notesData: any[] = [];

        if (leadId) {
          const cachedLead = leadCache.get(leadId);
          if (cachedLead) leadData = cachedLead;
          else {
            const l = await safeInvoke(`/lead/${leadId}/`);
            if (l) { leadData = l; leadCache.set(leadId, l); }
          }
          setLead(leadData);

          const cachedNotes = notesCache.get(leadId);
          if (cachedNotes) notesData = cachedNotes;
          else {
            const n = await safeInvoke(`/activity/note/?lead_id=${leadId}`);
            notesData = n?.data || [];
            notesCache.set(leadId, notesData);
          }
          setNotes(notesData);
        }

        dealCache.set(dealId, { deal: dealData, lead: leadData, notes: notesData });

        // Lookup our DB client_id via close_lead_id (most reliable) or by name
        setClientLink(null);
        const leadName = dealData?.lead_name || leadData?.display_name;
        if (leadId || leadName) {
          let q = supabase.from('close_deals').select('client_id, client_name, clients:client_id(id, name)').limit(1);
          if (leadId) q = q.eq('close_lead_id', leadId);
          else if (leadName) q = q.ilike('client_name', leadName);
          const { data: row } = await q.maybeSingle();
          const c: any = (row as any)?.clients;
          if (c?.id) setClientLink({ id: c.id, name: c.name });
          else if (leadName) {
            const { data: cli } = await supabase.from('clients').select('id, name').ilike('name', leadName).limit(1).maybeSingle();
            if (cli) setClientLink({ id: cli.id, name: cli.name });
          }
        }
      } catch (e) {
        console.error('CloseDealDetailPanel load error', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [dealId, open]);

  const fmtDT = (d?: string | null) => {
    if (!d) return '—';
    try { return format(parseISO(d), 'dd.MM.yyyy HH:mm', { locale: de }); } catch { return '—'; }
  };

  const fmtMoney = (d: any) => {
    if (!d) return '—';
    if (d.value_formatted) return d.value_formatted;
    if (d.value == null) return '—';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency', currency: d.value_currency || 'EUR', maximumFractionDigits: 0,
    }).format(d.value / 100);
  };

  const dealTitle = deal?.note?.split('\n')[0]?.slice(0, 80) || deal?.lead_name || 'Deal';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {loading && (
            <div className="space-y-4 mt-4">
              <Skeleton className="h-8 w-2/3" />
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {deal && !loading && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <span className="text-xl font-bold">{dealTitle}</span>
                    {clientLink && (
                      <Link
                        to={`/kunden/${clientLink.id}`}
                        className="text-sm text-primary hover:underline flex items-center gap-1 font-normal"
                      >
                        <User className="h-3 w-3" /> {clientLink.name}
                      </Link>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={STATUS_COLORS[deal.status_type] || 'bg-muted'}>
                        {deal.status_label || deal.status_type}
                      </Badge>
                      {deal.confidence != null && (
                        <Badge variant="outline">{deal.confidence}% Confidence</Badge>
                      )}
                    </div>
                  </div>
                  <a
                    href={`https://app.close.com/lead/${deal.lead_id}/`}
                    target="_blank" rel="noreferrer"
                    className="text-primary hover:underline text-sm flex items-center gap-1 shrink-0"
                  >
                    In Close öffnen <ExternalLink className="h-3 w-3" />
                  </a>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6 text-sm">
                <Section title="Deal Info">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Wert" value={<span className="font-mono">{fmtMoney(deal)}</span>} />
                    <Field label="Pipeline" value={deal.pipeline_name || '—'} />
                    <Field label="Status" value={deal.status_label || '—'} />
                    <Field label="Confidence" value={`${deal.confidence ?? '—'}%`} />
                    <Field label="Erstellt am" value={fmtDT(deal.date_created)} />
                    <Field label="Aktualisiert" value={fmtDT(deal.date_updated)} />
                    {deal.date_won && <Field label="Won am" value={fmtDT(deal.date_won)} />}
                    {deal.date_lost && <Field label="Lost am" value={fmtDT(deal.date_lost)} />}
                    {deal.lead_name && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground">Lead</div>
                        <button
                          onClick={() => setShowLead(deal.lead_id)}
                          className="text-primary hover:underline font-medium text-left"
                        >
                          {deal.lead_name}
                        </button>
                      </div>
                    )}
                  </div>
                </Section>

                {deal.note && (
                  <Section title="Deal-Notiz">
                    <p className="text-muted-foreground whitespace-pre-wrap">{deal.note}</p>
                  </Section>
                )}

                {lead?.contacts?.length > 0 && (
                  <Section title="Kontakte">
                    <div className="space-y-2">
                      {lead.contacts.map((c: any, i: number) => (
                        <div key={i} className="border border-border rounded-lg p-3 space-y-1">
                          <div className="font-semibold">{c.name || 'Unbenannt'}</div>
                          {c.title && <div className="text-xs text-muted-foreground">{c.title}</div>}
                          {c.emails?.map((e: any, j: number) => (
                            <a key={j} href={`mailto:${e.email}`} className="flex items-center gap-2 text-xs hover:text-primary">
                              <Mail className="h-3 w-3" /> {e.email}
                            </a>
                          ))}
                          {c.phones?.map((p: any, j: number) => (
                            <a key={j} href={`tel:${p.phone}`} className="flex items-center gap-2 text-xs hover:text-primary">
                              <Phone className="h-3 w-3" /> {p.phone}
                            </a>
                          ))}
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {notes.length > 0 && (
                  <Section title={`Notes (${notes.length})`}>
                    <div className="space-y-2">
                      {notes.map((n: any) => (
                        <div key={n.id} className="border border-border rounded-lg p-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span className="font-medium text-foreground">{n.user_name || 'Unbekannt'}</span>
                            <span>{fmtDT(n.date_created)}</span>
                          </div>
                          <p className="whitespace-pre-wrap">{n.note || n.note_html?.replace(/<[^>]+>/g, '') || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {deal.custom && Object.keys(deal.custom).length > 0 && (
                  <Section title="Custom Fields">
                    <div className="grid grid-cols-1 gap-2">
                      {Object.entries(deal.custom).map(([k, v]) => (
                        <div key={k} className="grid grid-cols-2 gap-2 border-b border-border pb-1.5">
                          <div className="text-xs text-muted-foreground truncate">{k}</div>
                          <div className="text-sm break-words">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw JSON</summary>
                  <pre className="mt-2 p-3 bg-muted rounded text-[10px] overflow-auto max-h-96">{JSON.stringify(deal, null, 2)}</pre>
                </details>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CloseLeadDetailPanel
        leadId={showLead}
        open={!!showLead}
        onOpenChange={(o) => !o && setShowLead(null)}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
