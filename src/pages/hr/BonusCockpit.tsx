import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

type KritKey = 'zufriedenheit' | 'cash_niveau' | 'cash_entwicklung' | 'churn' | 'calls';
type Krit = { status: 'ok' | 'keine_daten' | 'unvollstaendig'; punkte: number | null; max: number; wert: any; hinweis?: string };
type Result = {
  kriterien: Record<KritKey, Krit>; punkte_gesamt: number; punkte_bewertbar_max: number; punkte_max: number;
  nicht_bewertbare_kriterien: number; bonus_eur: number; upsell_beteiligung_eur: number; berechnet_am: string;
};

const ORDER: { key: KritKey; label: string }[] = [
  { key: 'zufriedenheit', label: 'Kundenzufriedenheit' },
  { key: 'cash_niveau', label: 'Cash Collect Niveau' },
  { key: 'cash_entwicklung', label: 'Cash Collect Entwicklung' },
  { key: 'churn', label: 'Anti-Churn' },
  { key: 'calls', label: 'Checkup-Calls' },
];
const num = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { maximumFractionDigits: d }));
const eur = (n: number | null | undefined) => (n === null || n === undefined ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }));
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('de-DE') : '–');
const months = () => { const o: string[] = []; const d = new Date(2026, 8, 1); for (let i = 0; i < 18; i++) { o.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); d.setMonth(d.getMonth() + 1); } return o; };
const defaultMonth = () => { const d = new Date(); const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; return months().includes(m) ? m : '2026-10-01'; };

function wertText(key: KritKey, k: Krit) {
  const w = k.wert || {};
  switch (key) {
    case 'zufriedenheit': return w.ausfuellquote !== undefined ? `Ø ${num(w.durchschnitt_score_betreuung)} · Quote ${num(w.ausfuellquote)} %` : '–';
    case 'cash_niveau': return w.summe_eur !== undefined ? eur(w.summe_eur) : '–';
    case 'cash_entwicklung': return w.veraenderung_prozent !== undefined ? `${w.veraenderung_prozent > 0 ? '+' : ''}${num(w.veraenderung_prozent)} %` : '–';
    case 'churn': return w.churn_quote !== undefined ? `${num(w.churn_quote)} % Churn` : '–';
    case 'calls': return w.anzahl_calls !== undefined ? `${w.anzahl_calls} Calls` : '–';
  }
}

export default function BonusCockpit() {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [mitarbeiter, setMitarbeiter] = useState<{ id: string; name: string }[]>([]);
  const [maId, setMaId] = useState('');
  const [monat, setMonat] = useState(defaultMonth());
  const [res, setRes] = useState<Result | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<KritKey | null>(null);

  useEffect(() => {
    (async () => {
      const { data: cm } = await supabase.rpc('bonus_can_manage');
      setCanManage(!!cm);
      // RLS: admins see all, employees only their own row
      const { data } = await supabase.from('bonus_mitarbeiter').select('id, team:team_id(name)').eq('aktiv', true);
      const l = ((data as any[]) || []).map(m => ({ id: m.id, name: m.team?.name || '–' }));
      setMitarbeiter(l);
      if (l[0]) setMaId(l[0].id);
    })();
  }, []);

  const run = async (speichern: boolean) => {
    if (!maId) return;
    setLoading(true); setErr(null);
    const { data, error } = await supabase.functions.invoke('bonus-berechnung', { body: { monat, mitarbeiter_id: maId, speichern } });
    setLoading(false);
    if (error) { setErr(error.message); if (speichern) toast.error('Berechnung fehlgeschlagen', { description: error.message }); return; }
    setRes(data as Result);
    if (speichern) toast.success('Neu berechnet und gespeichert');
    const { data: bm } = await supabase.from('bonus_monate').select('updated_at').eq('monat', monat).eq('mitarbeiter_id', maId).maybeSingle();
    setLastSaved(bm?.updated_at ?? null);
  };
  useEffect(() => { run(false); }, [monat, maId]);

  const maName = mitarbeiter.find(m => m.id === maId)?.name;

  return (
    <PageShell>
      <PageHeader title="Bonus-Cockpit" description={canManage ? 'Monatliche Aufstellung je Kriterium (§ 5 Abs. 3 Bonusvereinbarung).' : `Deine monatliche Aufstellung${maName ? ` – ${maName}` : ''}.`} />

      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={monat} onValueChange={setMonat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{months().map(m => <SelectItem key={m} value={m}>{new Date(m).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</SelectItem>)}</SelectContent>
        </Select>
        {canManage && (
          <Select value={maId} onValueChange={setMaId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Mitarbeiter" /></SelectTrigger>
            <SelectContent>{mitarbeiter.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {canManage !== null && !mitarbeiter.length && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Für dich ist kein Bonusmodell hinterlegt.</CardContent></Card>
      )}
      {err && <Card className="mb-6"><CardContent className="py-4 text-sm text-destructive">{err}</CardContent></Card>}

      {res && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><CardContent className="p-5">
              <div className="text-xs text-muted-foreground">Erreichte Punkte</div>
              <div className="text-3xl font-semibold tabular-nums">{num(res.punkte_gesamt)} <span className="text-base text-muted-foreground">von {res.punkte_max}</span></div>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="text-xs text-muted-foreground">Bonus</div>
              <div className="text-3xl font-semibold tabular-nums">{eur(res.bonus_eur)}</div>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <div className="text-xs text-muted-foreground">Upsell-Beteiligung (separat)</div>
              <div className="text-3xl font-semibold tabular-nums">{eur(res.upsell_beteiligung_eur)}</div>
            </CardContent></Card>
          </div>

          {res.nicht_bewertbare_kriterien > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Nur <b className="tabular-nums">{res.punkte_bewertbar_max}</b> von {res.punkte_max} Punkten sind derzeit bewertbar — <b className="tabular-nums">{res.nicht_bewertbare_kriterien}</b> {res.nicht_bewertbare_kriterien === 1 ? 'Kriterium hat' : 'Kriterien haben'} keine Datengrundlage.</span>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {ORDER.map(({ key, label }, i) => {
              const k = res.kriterien[key];
              const ok = k.status === 'ok';
              return (
                <button key={key} onClick={() => setDetail(key)} className="text-left">
                  <Card className={`h-full transition-colors hover:border-primary/50 ${ok ? '' : 'border-dashed bg-muted/40'}`}>
                    <CardContent className="p-4 flex flex-col gap-3 h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{i + 1}. {label}</div>
                        <span className="text-xs text-muted-foreground tabular-nums">max {k.max}</span>
                      </div>
                      {ok ? (
                        <>
                          <div className="text-xs text-muted-foreground tabular-nums">{wertText(key, k)}</div>
                          <div className="text-3xl font-semibold tabular-nums">{num(k.punkte)}</div>
                          <Progress value={((k.punkte ?? 0) / k.max) * 100} />
                        </>
                      ) : (
                        <div className="flex-1 flex flex-col gap-2">
                          <Badge variant="outline" className="w-fit text-muted-foreground">{key === 'churn' && k.wert?.erfassung_bestaetigt === false ? 'Churn-Erfassung nicht bestätigt' : k.status === 'keine_daten' ? 'Keine Datengrundlage' : 'Unvollständig'}</Badge>
                          <p className="text-xs text-muted-foreground">{k.hinweis}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {canManage && (
          <Button onClick={() => run(true)} disabled={loading || !maId}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Neu berechnen
          </Button>
        )}
        <span className="text-sm text-muted-foreground tabular-nums">
          Zuletzt gespeichert: {lastSaved ? new Date(lastSaved).toLocaleString('de-DE') : 'noch nie'}
        </span>
      </div>

      <Sheet open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {detail && <Detail kind={detail} monat={monat} maId={maId} res={res} canManage={!!canManage} onChanged={() => run(true)} />}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function Table({ head, rows, empty }: { head: React.ReactNode[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="rounded-lg border border-border overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground"><tr>{head.map((h, i) => <th key={i} className="text-left px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => <tr key={i} className="border-t border-border align-top">{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}
          {!rows.length && <tr><td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ kind, monat, maId, res, canManage, onChanged }: { kind: KritKey; monat: string; maId: string; res: Result | null; canManage: boolean; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);
  const saveFreigabe = async (v: boolean) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('bonus_monat_freigaben').upsert({
      monat, mitarbeiter_id: maId, churn_erfassung_abgeschlossen: v,
      churn_bestaetigt_von: v ? u.user?.id ?? null : null, churn_bestaetigt_am: v ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'monat,mitarbeiter_id' });
    setConfirm(null);
    if (error) { toast.error('Speichern fehlgeschlagen', { description: error.message }); return; }
    toast.success(v ? 'Churn-Erfassung bestätigt' : 'Bestätigung zurückgenommen');
    setTick(t => t + 1); onChanged();
  };
  useEffect(() => {
    (async () => {
      if (kind === 'zufriedenheit') {
        const { data: t } = await supabase.from('bonus_survey_tokens').select('token, ausgefuellt_am, versendet_am, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId);
        const toks = (t as any[]) || [];
        const { data: a } = toks.length ? await supabase.from('bonus_survey_antworten').select('*').in('token', toks.map(x => x.token)) : { data: [] };
        setData({ toks, ans: (a as any[]) || [] });
      } else if (kind === 'cash_niveau' || kind === 'cash_entwicklung') {
        const { data: c } = await supabase.from('bonus_cash_collect').select('id, betrag, eingang_am, quelle, zugeordnet, mitarbeiter_id, clients:client_id(name)').eq('monat', monat).or(`mitarbeiter_id.eq.${maId},zugeordnet.eq.false`).order('eingang_am');
        setData({ rows: (c as any[]) || [] });
      } else if (kind === 'churn') {
        const { data: c } = await supabase.from('bonus_churn_events').select('typ, zaehlt_als_churn, bemerkung, festgestellt_am, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId);
        const { count } = await supabase.from('bonus_kunden_snapshot').select('id', { count: 'exact', head: true }).eq('monat', monat).eq('mitarbeiter_id', maId);
        const { data: frg } = await supabase.from('bonus_monat_freigaben').select('churn_erfassung_abgeschlossen, churn_bestaetigt_am').eq('monat', monat).eq('mitarbeiter_id', maId).maybeSingle();
        setData({ rows: (c as any[]) || [], snap: count ?? 0, frg });
      } else {
        const { data: c } = await supabase.from('bonus_checkins').select('datum, quelle, stimmung, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId).order('datum');
        setData({ rows: (c as any[]) || [] });
      }
    })();
  }, [kind, monat, maId, tick]);

  const title = ORDER.find(o => o.key === kind)?.label;
  const k = res?.kriterien[kind];

  const nichtGeantwortet = useMemo(() => {
    if (kind !== 'zufriedenheit' || !data) return [];
    const answered = new Set(data.ans.map((a: any) => a.token));
    return data.toks.filter((t: any) => !answered.has(t.token));
  }, [data, kind]);

  return (
    <>
      <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
      {k && k.status !== 'ok' && <p className="mt-2 text-sm text-muted-foreground">{k.hinweis}</p>}
      <div className="mt-4 space-y-6">
        {!data && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

        {data && kind === 'zufriedenheit' && (() => {
          const nameOf = (tok: string) => data.toks.find((t: any) => t.token === tok)?.clients?.name || '–';
          return (
            <>
              <Table
                head={['Kunde', 'Kontakt', 'Datum', 'B1', 'B2', 'B3', 'B4', 'L1', 'L2', 'L3', 'Score Betreuung', <span className="text-muted-foreground/70">Score Leistung (nicht bonusrelevant)</span>, 'Freitext']}
                rows={data.ans.map((a: any) => [nameOf(a.token), a.kontaktname, dt(a.created_at), a.b1_reaktionszeit, a.b2_umgang, a.b3_verbindlichkeit, a.b4_eigeninitiative, a.l1_anfragemenge, a.l2_anfragequalitaet, a.l3_weiterempfehlung,
                  <b>{num(Number(a.score_betreuung))}</b>, <span className="text-muted-foreground/70">{num(Number(a.score_leistung))}</span>, <span className="font-sans text-xs">{a.freitext || '–'}</span>])}
                empty="Noch keine Einsendungen."
              />
              <div>
                <h3 className="text-sm font-medium mb-2">Nicht geantwortet ({nichtGeantwortet.length})</h3>
                <Table head={['Kunde', 'Versendet am']} rows={nichtGeantwortet.map((t: any) => [t.clients?.name || '–', dt(t.versendet_am)])} empty="Alle haben geantwortet." />
              </div>
            </>
          );
        })()}

        {data && (kind === 'cash_niveau' || kind === 'cash_entwicklung') && (() => {
          const offen = data.rows.filter((r: any) => !r.zugeordnet);
          const zu = data.rows.filter((r: any) => r.zugeordnet && r.mitarbeiter_id === maId);
          const row = (r: any) => [r.clients?.name || '–', eur(Number(r.betrag)), dt(r.eingang_am), r.quelle, r.zugeordnet ? 'Ja' : 'Nein'];
          return (
            <>
              {kind === 'cash_entwicklung' && k?.wert && (
                <p className="text-sm tabular-nums">Monat: {eur(k.wert.summe_eur)} · Referenz {k.wert.referenzmonat}: {eur(k.wert.vormonat_eur)} · Veränderung: {k.wert.veraenderung_prozent !== undefined ? `${num(k.wert.veraenderung_prozent)} %` : '–'}</p>
              )}
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Klärliste – nicht zugeordnete Zahlungen ({offen.length})</h3>
                <Table head={['Kunde', 'Betrag', 'Eingang', 'Quelle', 'Zugeordnet']} rows={offen.map(row)} empty="Keine offenen Zahlungen." />
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Zugeordnete Zahlungseingänge ({zu.length})</h3>
                <Table head={['Kunde', 'Betrag', 'Eingang', 'Quelle', 'Zugeordnet']} rows={zu.map(row)} empty="Keine zugeordneten Zahlungen." />
              </div>
            </>
          );
        })()}

        {data && kind === 'churn' && (
          <>
            <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Churn-Erfassung für diesen Monat abgeschlossen</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.frg?.churn_erfassung_abgeschlossen
                    ? `Bestätigt am ${data.frg.churn_bestaetigt_am ? new Date(data.frg.churn_bestaetigt_am).toLocaleString('de-DE') : '–'}`
                    : 'Nicht bestätigt — Kriterium wird nicht bewertet.'}
                </div>
              </div>
              {canManage && <Switch checked={!!data.frg?.churn_erfassung_abgeschlossen} onCheckedChange={v => setConfirm(v)} />}
            </div>
            <p className="text-sm tabular-nums">Betreute Kunden am Monatsersten (Nenner): <b>{data.snap}</b></p>
            <Table head={['Kunde', 'Typ', 'Zählt als Churn', 'Festgestellt', 'Bemerkung']}
              rows={data.rows.map((r: any) => [r.clients?.name || '–', r.typ, r.zaehlt_als_churn ? 'Ja' : 'Nein', dt(r.festgestellt_am), r.bemerkung || '–'])}
              empty="Keine Churn-Ereignisse erfasst." />
            <AlertDialog open={confirm !== null} onOpenChange={o => !o && setConfirm(null)}>
              <AlertDialogContent className="z-[400]">
                <AlertDialogHeader>
                  <AlertDialogTitle>{confirm ? 'Churn-Erfassung bestätigen?' : 'Bestätigung zurücknehmen?'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirm
                      ? `Du bestätigst, dass alle Kündigungen und Abbrüche für ${new Date(monat).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} erfasst sind und die Liste vollständig ist. Auf dieser Grundlage wird das Kriterium Anti-Churn bewertet — auch wenn die Liste leer ist (dann 0 % Churn, volle Punkte).`
                      : 'Das Kriterium Anti-Churn wird danach wieder als nicht bewertbar geführt.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={() => saveFreigabe(!!confirm)}>{confirm ? 'Ja, Liste ist vollständig' : 'Zurücknehmen'}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {data && kind === 'calls' && (
          <Table head={['Kunde', 'Datum', 'Quelle', 'Stimmung']}
            rows={data.rows.map((r: any) => [r.clients?.name || '–', dt(r.datum), r.quelle, r.stimmung || '–'])}
            empty="Keine Checkup-Calls erfasst." />
        )}
      </div>
    </>
  );
}
