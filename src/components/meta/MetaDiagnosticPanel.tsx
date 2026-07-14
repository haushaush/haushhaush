import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, PlayCircle, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';

type Overall = 'success' | 'partial' | 'failed';

interface Diag {
  generated_at: string;
  overall: Overall;
  tests: any;
}

function overallBadge(o: Overall | undefined) {
  if (o === 'success') return { label: 'Erfolgreich', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30', Icon: CheckCircle2 };
  if (o === 'partial') return { label: 'Teilweise verfügbar', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30', Icon: AlertTriangle };
  return { label: 'Fehlgeschlagen', cls: 'bg-rose-500/15 text-rose-600 border-rose-500/30', Icon: XCircle };
}

function statusPill(s: string) {
  const map: Record<string, string> = {
    'Verfügbar': 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
    'Leer': 'bg-slate-500/15 text-slate-600 border-slate-500/30',
    'Nicht unterstützt': 'bg-slate-500/15 text-slate-600 border-slate-500/30',
    'Berechtigung fehlt': 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    'API-Fehler': 'bg-rose-500/15 text-rose-600 border-rose-500/30',
  };
  return <Badge variant="outline" className={map[s] || ''}>{s}</Badge>;
}

function Bool({ v }: { v: boolean }) {
  return v
    ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Ja</Badge>
    : <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30">Nein</Badge>;
}

export default function MetaDiagnosticPanel() {
  const [loading, setLoading] = useState(false);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setRawError(null);
    try {
      const { data, error } = await supabase.functions.invoke('debug-meta-billing', { body: { mode: 'diagnostic' } });
      if (error) {
        // Try to get real reason
        let detail = error.message || 'Edge Function nicht erreichbar';
        if (/Failed to send/i.test(detail)) detail += ' — Function evtl. nicht deployed, falscher Name, Auth/CORS-Fehler oder Netzwerkfehler.';
        setRawError(detail);
        setDiag({
          generated_at: new Date().toISOString(),
          overall: 'failed',
          tests: {
            edge_function: { reachable: false, cors_ok: false, auth_ok: false, runtime_ms: 0, error: detail },
            secrets: {}, token: { valid: false }, accounts: { ok: false },
          },
        });
      } else if (data?.error) {
        setRawError(data.error);
        setDiag({
          generated_at: new Date().toISOString(),
          overall: 'failed',
          tests: {
            edge_function: { reachable: true, cors_ok: true, auth_ok: false, runtime_ms: 0, error: data.error },
            secrets: {}, token: { valid: false }, accounts: { ok: false },
          },
        });
      } else {
        setDiag(data);
      }
    } catch (e: any) {
      setRawError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function copyJson() {
    if (!diag) return;
    const t = diag.tests;
    const cleaned = {
      generated_at: diag.generated_at,
      overall: diag.overall,
      function_reachable: !!t.edge_function?.reachable,
      secrets: t.secrets,
      token_valid: !!t.token?.valid,
      token_type: t.token?.type ?? null,
      token_expires_at: t.token?.expires_at ?? null,
      relevant_scopes: t.token?.relevant_scopes ?? null,
      accessible_accounts: t.accounts?.total ?? 0,
      active_accounts: t.accounts?.active ?? 0,
      pagination_complete: t.accounts?.pagination_complete ?? null,
      available_fields: (t.fields?.rows ?? []).filter((r: any) => r.status === 'Verfügbar').map((r: any) => r.field),
      unavailable_fields: (t.fields?.rows ?? []).filter((r: any) => r.status !== 'Verfügbar').map((r: any) => r.field),
      insights_ok: !!t.insights?.ok,
      spend_available: !!t.insights?.spend_available,
      business_id_present: !!t.business_id?.present,
      invoices_state: t.invoices?.state ?? null,
      invoices_count: t.invoices?.items_count ?? 0,
      invoices_pages: t.invoices?.pages_loaded ?? 0,
      invoices_pagination_complete: t.invoices?.pagination_complete ?? null,
      invoices_fields: t.invoices?.detected_fields ?? [],
      invoices_statuses: t.invoices?.statuses ?? [],
      invoices_currencies: t.invoices?.currencies ?? [],
    };
    navigator.clipboard.writeText(JSON.stringify(cleaned, null, 2));
    toast.success('Diagnose-JSON kopiert (ohne Secrets)');
  }

  const t = diag?.tests ?? {};
  const overall = diag ? overallBadge(diag.overall) : null;

  const inv = t.invoices || {};
  const invState = inv.state as string | undefined;
  const invLabelMap: Record<string, { label: string; cls: string }> = {
    ok: { label: 'Erfolgreich', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' },
    empty: { label: 'Leer', cls: 'bg-slate-500/15 text-slate-600 border-slate-500/30' },
    permission_denied: { label: 'Berechtigung fehlt', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/30' },
    endpoint_unavailable: { label: 'Nicht verfügbar', cls: 'bg-slate-500/15 text-slate-600 border-slate-500/30' },
    no_business_id: { label: 'Business ID fehlt', cls: 'bg-rose-500/15 text-rose-600 border-rose-500/30' },
    error: { label: 'Fehler', cls: 'bg-rose-500/15 text-rose-600 border-rose-500/30' },
  };
  const invBadge = invState ? invLabelMap[invState] : null;

  const summaryRows = diag ? [
    { name: 'Edge Function', ok: t.edge_function?.reachable, detail: t.edge_function?.reachable ? `erreichbar (${t.edge_function.runtime_ms}ms)` : (t.edge_function?.error || 'nicht erreichbar') },
    { name: 'Meta Token', ok: t.token?.valid, detail: t.token?.valid ? 'gültig' : (t.token?.error || 'ungültig / nicht prüfbar') },
    { name: 'Werbekonten', ok: t.accounts?.ok, detail: t.accounts?.ok ? `${t.accounts.total} Accounts` : (t.accounts?.error || '–') },
    { name: 'Account-Felder', ok: t.fields?.ok, detail: t.fields?.ok ? `${(t.fields.rows || []).filter((r: any) => r.status === 'Verfügbar').length}/${(t.fields.rows || []).length} verfügbar` : (t.fields?.error || '–') },
    { name: 'Insights', ok: t.insights?.ok, detail: t.insights?.ok ? (t.insights.spend_available ? 'Spend abrufbar' : 'keine Zeilen') : (t.insights?.error || '–') },
    { name: 'Business ID', ok: !!t.business_id?.present, detail: t.business_id?.present ? `verfügbar (${t.business_id.masked})` : 'Keine Meta Business ID konfiguriert' },
    { name: 'Business Invoices Edge', ok: invState === 'ok' || invState === 'empty', detail: inv.note || '–' },
  ] : [];

  return (
    <Card className="p-0 border-dashed">
      <Accordion type="single" collapsible>
        <AccordionItem value="diag" className="border-none">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Meta API Diagnose</span>
              <Badge variant="outline" className="text-[10px]">Admin</Badge>
              {overall && (
                <Badge variant="outline" className={overall.cls}>
                  <overall.Icon className="h-3 w-3 mr-1" />{overall.label}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={run} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Diagnose starten
              </Button>
              {diag && (
                <Button size="sm" variant="outline" onClick={copyJson}>
                  <Copy className="h-4 w-4 mr-2" />Diagnose kopieren
                </Button>
              )}
              {diag && (
                <span className="text-xs text-muted-foreground">
                  Letzte Diagnose: {new Date(diag.generated_at).toLocaleString('de-DE')}
                </span>
              )}
            </div>

            {rawError && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
                <div className="font-medium text-rose-600 mb-1">Fehlerdetail</div>
                <code className="whitespace-pre-wrap break-words">{rawError}</code>
              </div>
            )}

            {!diag && !loading && (
              <p className="text-sm text-muted-foreground">
                Diagnose ist schreibgeschützt und verändert keine Abrechnungsdaten. Startet nur API-Testaufrufe.
              </p>
            )}

            {diag && (
              <>
                {/* Summary */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Ergebnisübersicht</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test</TableHead>
                        <TableHead>Ergebnis</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRows.map((r) => (
                        <TableRow key={r.name}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>
                            {r.ok
                              ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Erfolgreich</Badge>
                              : (r.name === 'Rechnungen' || r.name === 'Zahlungen')
                                ? <Badge variant="outline" className="bg-slate-500/15 text-slate-600 border-slate-500/30">Nicht unterstützt</Badge>
                                : <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30">Fehlgeschlagen</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Secrets */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Secrets</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    {Object.entries(t.secrets || {}).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between border rounded px-3 py-2">
                        <span className="font-mono text-xs">{k}</span>
                        <Bool v={!!v} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Token */}
                {t.token && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Token-Diagnose</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      <Info label="Gültig" value={t.token.valid ? 'Ja' : 'Nein'} />
                      <Info label="Typ" value={t.token.type ?? '–'} />
                      <Info label="App-ID" value={t.token.app_id ?? '–'} />
                      <Info label="Ablaufdatum" value={t.token.expires_at ? new Date(t.token.expires_at).toLocaleString('de-DE') : (t.token.expires_at === null ? 'nie / nicht verfügbar' : '–')} />
                      <Info label="Datenzugriff bis" value={t.token.data_access_expires_at ? new Date(t.token.data_access_expires_at).toLocaleString('de-DE') : '–'} />
                      <Info label="Laufzeit" value={`${t.token.runtime_ms ?? 0}ms`} />
                    </div>
                    {t.token.scopes ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.token.scopes.map((s: string) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className={(t.token.relevant_scopes || []).includes(s) ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' : ''}
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-2">{t.token.scopes_note}</p>
                    )}
                  </div>
                )}

                {/* Accounts */}
                {t.accounts && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Zugängliche Werbekonten</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-2">
                      <Info label="Gesamt" value={String(t.accounts.total ?? 0)} />
                      <Info label="Aktiv" value={String(t.accounts.active ?? 0)} />
                      <Info label="Inaktiv" value={String(t.accounts.inactive ?? 0)} />
                      <Info label="Pagination vollständig" value={t.accounts.pagination_complete ? 'Ja' : 'Nein'} />
                    </div>
                    {t.accounts.sources && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {Object.entries(t.accounts.sources).map(([s, n]) => (
                          <Badge key={s} variant="outline">{s}: {String(n)}</Badge>
                        ))}
                      </div>
                    )}
                    {(t.accounts.sample || []).length > 0 && (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Account-ID</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Währung</TableHead>
                              <TableHead>Quelle</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {t.accounts.sample.map((a: any) => (
                              <TableRow key={a.id}>
                                <TableCell className="text-xs">{a.name}</TableCell>
                                <TableCell className="font-mono text-xs">{a.id}</TableCell>
                                <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                                <TableCell className="text-xs">{a.currency ?? '–'}</TableCell>
                                <TableCell className="text-xs">{a.source ?? '–'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Zeigt max. 20 Beispiele von insgesamt {t.accounts.total}.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Fields */}
                {t.fields?.rows?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Account-Felder</h3>
                    <p className="text-[10px] text-muted-foreground mb-2">Getestet auf: <span className="font-mono">{t.fields.account_id}</span></p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Feld</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Beispiel</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {t.fields.rows.map((r: any) => (
                          <TableRow key={r.field}>
                            <TableCell className="font-mono text-xs">{r.field}</TableCell>
                            <TableCell>{statusPill(r.status)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.example ? (typeof r.example === 'object' ? JSON.stringify(r.example) : String(r.example)) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Insights */}
                {t.insights && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Insights (letzte 7 Tage)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <Info label="Erreichbar" value={t.insights.ok ? 'Ja' : 'Nein'} />
                      <Info label="Zeilen" value={String(t.insights.rows ?? 0)} />
                      <Info label="Spend verfügbar" value={t.insights.spend_available ? 'Ja' : 'Nein'} />
                      <Info label="Währung" value={t.insights.currency ?? '–'} />
                    </div>
                    {t.insights.error && (
                      <p className="text-xs text-rose-600 mt-2">{t.insights.error}</p>
                    )}
                  </div>
                )}

                {/* Summary — replace generic status cell for invoices with dedicated badge */}
                {invBadge && (
                  <div className="text-xs text-muted-foreground -mt-2">
                    Business Invoices Status: <Badge variant="outline" className={invBadge.cls}>{invBadge.label}</Badge>
                  </div>
                )}

                {/* Business Invoices detailed diagnostics */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Business Invoices Diagnose</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Test</TableHead>
                        <TableHead>Ergebnis</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell>Business ID</TableCell>
                        <TableCell>{t.business_id?.present
                          ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Verfügbar</Badge>
                          : <Badge variant="outline" className="bg-rose-500/15 text-rose-600 border-rose-500/30">Fehlt</Badge>}</TableCell>
                        <TableCell className="font-mono text-xs">{t.business_id?.masked ?? '—'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Business Invoices Edge</TableCell>
                        <TableCell>{invBadge ? <Badge variant="outline" className={invBadge.cls}>{invBadge.label}</Badge> : '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.endpoint && <div className="font-mono">{inv.endpoint}</div>}
                          {inv.note}
                          {inv.error_code != null && (
                            <div className="text-rose-600 mt-1">
                              HTTP {inv.http_status ?? '?'} · code {inv.error_code}{inv.error_subcode ? ` / ${inv.error_subcode}` : ''} — {inv.error_message}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Pagination</TableCell>
                        <TableCell>
                          {invState === 'ok' || invState === 'empty'
                            ? (inv.pagination_complete
                                ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Vollständig</Badge>
                                : <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">Unvollständig</Badge>)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(invState === 'ok' || invState === 'empty')
                            ? `${inv.pages_loaded ?? 0} Seiten · ${inv.items_count ?? 0} Rechnungen`
                            : '—'}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Rechnungsfelder</TableCell>
                        <TableCell>
                          {(inv.detected_fields?.length ?? 0) > 0
                            ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">{inv.detected_fields.length} Felder</Badge>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            {(inv.detected_fields ?? []).map((f: string) => (
                              <Badge key={f} variant="outline" className="font-mono text-[10px]">{f}</Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Rechnungsstatus</TableCell>
                        <TableCell>
                          {(inv.statuses?.length ?? 0) > 0
                            ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Verfügbar</Badge>
                            : <Badge variant="outline" className="bg-slate-500/15 text-slate-600 border-slate-500/30">Nicht vorhanden</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-wrap gap-1">
                            {(inv.statuses ?? []).map((s: string) => (
                              <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Währungen</TableCell>
                        <TableCell>
                          {(inv.currencies?.length ?? 0) > 0
                            ? <Badge variant="outline">{inv.currencies.length}</Badge>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(inv.currencies ?? []).join(', ') || '—'}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Zeitraum</TableCell>
                        <TableCell>
                          {inv.min_date || inv.max_date
                            ? <Badge variant="outline">Erkannt</Badge>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.min_date && inv.max_date ? `${inv.min_date} → ${inv.max_date}` : '—'}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>Rechnungsdokumente</TableCell>
                        <TableCell>
                          {(inv.downloadable_count ?? 0) > 0
                            ? <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">Verfügbar</Badge>
                            : <Badge variant="outline" className="bg-slate-500/15 text-slate-600 border-slate-500/30">Nicht vorhanden</Badge>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inv.downloadable_count ?? 0} URLs
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Aufruf: <span className="font-mono">GET /{'{BUSINESS_ID}'}/business_invoices</span> · start_date = heute − 12 Monate · limit = 100 · Pagination via <span className="font-mono">paging.next</span>.
                  </p>
                </div>
                  </div>
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-mono text-xs mt-0.5 break-all">{value}</div>
    </div>
  );
}
