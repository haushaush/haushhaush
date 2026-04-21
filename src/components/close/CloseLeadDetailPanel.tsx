import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, Mail, Phone, Link as LinkIcon, MapPin, UserPlus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
  leadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateKunde?: (lead: any) => void;
}

const detailCache = new Map<string, any>();

export function CloseLeadDetailPanel({ leadId, open, onOpenChange, onCreateKunde }: Props) {
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !leadId) return;
    if (detailCache.has(leadId)) {
      setLead(detailCache.get(leadId));
      return;
    }
    setLoading(true);
    setLead(null);
    supabase.functions.invoke('close-proxy', {
      body: { endpoint: `/lead/${leadId}/`, method: 'GET' },
    }).then(({ data, error }) => {
      if (!error && data && !data.error) {
        detailCache.set(leadId, data);
        setLead(data);
      }
      setLoading(false);
    });
  }, [leadId, open]);

  const fmtDT = (d?: string | null) => {
    if (!d) return '—';
    try { return format(parseISO(d), 'dd.MM.yyyy HH:mm', { locale: de }); } catch { return '—'; }
  };

  return (
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

        {lead && !loading && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <span className="text-xl font-bold">{lead.display_name || lead.name || 'Lead'}</span>
                  <div className="flex items-center gap-2">
                    {lead.status_label && <Badge variant="secondary">{lead.status_label}</Badge>}
                  </div>
                </div>
                <a
                  href={`https://app.close.com/lead/${lead.id}/`}
                  target="_blank" rel="noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1 shrink-0"
                >
                  In Close öffnen <ExternalLink className="h-3 w-3" />
                </a>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-6 space-y-6 text-sm">
              {onCreateKunde && (
                <Button onClick={() => onCreateKunde(lead)} className="w-full">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Als Kunde anlegen
                </Button>
              )}

              {lead.description && (
                <Section title="Beschreibung">
                  <p className="text-muted-foreground whitespace-pre-wrap">{lead.description}</p>
                </Section>
              )}

              {lead.contacts?.length > 0 && (
                <Section title={`Kontakte (${lead.contacts.length})`}>
                  <div className="space-y-3">
                    {lead.contacts.map((c: any, i: number) => (
                      <div key={i} className="border border-border rounded-lg p-3 space-y-1.5">
                        <div className="font-semibold">{c.name || c.display_name || 'Unbenannt'}</div>
                        {c.title && <div className="text-xs text-muted-foreground">{c.title}</div>}
                        {c.emails?.map((e: any, j: number) => (
                          <a key={`e${j}`} href={`mailto:${e.email}`} className="flex items-center gap-2 text-xs hover:text-primary">
                            <Mail className="h-3 w-3" /> {e.email} {e.type && <span className="text-muted-foreground">({e.type})</span>}
                          </a>
                        ))}
                        {c.phones?.map((p: any, j: number) => (
                          <a key={`p${j}`} href={`tel:${p.phone}`} className="flex items-center gap-2 text-xs hover:text-primary">
                            <Phone className="h-3 w-3" /> {p.phone} {p.type && <span className="text-muted-foreground">({p.type})</span>}
                          </a>
                        ))}
                        {c.urls?.map((u: any, j: number) => (
                          <a key={`u${j}`} href={u.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs hover:text-primary truncate">
                            <LinkIcon className="h-3 w-3 shrink-0" /> {u.url}
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {lead.opportunities?.length > 0 && (
                <Section title={`Deals (${lead.opportunities.length})`}>
                  <div className="space-y-2">
                    {lead.opportunities.map((o: any) => (
                      <div key={o.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{o.note?.split('\n')[0]?.slice(0, 60) || 'Deal'}</div>
                          <div className="text-xs text-muted-foreground">{o.status_label} · {o.value_formatted || (o.value ? `${(o.value / 100).toFixed(0)} €` : '—')}</div>
                        </div>
                        <Badge variant="outline">{o.status_type}</Badge>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {lead.tasks?.length > 0 && (
                <Section title={`Offene Aufgaben (${lead.tasks.length})`}>
                  <div className="space-y-2">
                    {lead.tasks.filter((t: any) => !t.is_complete).map((t: any) => (
                      <div key={t.id} className="border border-border rounded-lg p-3">
                        <div className="font-medium">{t.text}</div>
                        {t.date && <div className="text-xs text-muted-foreground">Fällig: {fmtDT(t.date)}</div>}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {lead.addresses?.length > 0 && (
                <Section title="Adressen">
                  <div className="space-y-2">
                    {lead.addresses.map((a: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                        <div>
                          {a.address_1 && <div>{a.address_1}</div>}
                          {a.address_2 && <div>{a.address_2}</div>}
                          <div>{[a.zipcode, a.city].filter(Boolean).join(' ')}</div>
                          <div>{[a.state, a.country].filter(Boolean).join(', ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {lead.custom && Object.keys(lead.custom).length > 0 && (
                <Section title="Custom Fields">
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(lead.custom).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-2 gap-2 border-b border-border pb-1.5">
                        <div className="text-xs text-muted-foreground truncate">{k}</div>
                        <div className="text-sm break-words">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              <Section title="Info">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Erstellt am" value={fmtDT(lead.date_created)} />
                  <Field label="Aktualisiert" value={fmtDT(lead.date_updated)} />
                  {lead.created_by_name && <Field label="Erstellt von" value={lead.created_by_name} />}
                  {lead.url && (
                    <div>
                      <div className="text-xs text-muted-foreground">Website</div>
                      <a href={lead.url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate block">{lead.url}</a>
                    </div>
                  )}
                </div>
              </Section>

              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw JSON</summary>
                <pre className="mt-2 p-3 bg-muted rounded text-[10px] overflow-auto max-h-96">{JSON.stringify(lead, null, 2)}</pre>
              </details>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
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
