import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { CheckinKandidaten } from '@/components/bonus/CheckinKandidaten';

type KritKey = 'zufriedenheit' | 'cash_niveau' | 'cash_entwicklung' | 'churn' | 'calls';
type Krit = { status: 'ok' | 'keine_daten' | 'unvollstaendig'; punkte: number; max: number; wert: any; hinweis?: string; basis_hinweis: string | null };
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
    case 'calls': return w.erreichungsgrad_prozent != null ? `${num(w.erreichungsgrad_prozent)} % Abdeckung · ${num(w.gewichtete_summe)} von ${w.zielwert} gewichtet · ${w.anzahl_calls} Calls` : w.anzahl_calls !== undefined ? `${w.anzahl_calls} Calls` : '–';
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
  const [monthStatus, setMonthStatus] = useState<string | null>(null);
  const [approval, setApproval] = useState<Result | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [approving, setApproving] = useState(false);
  const [spiegelOffen, setSpiegelOffen] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: cm } = await supabase.rpc('bonus_can_manage');
      setCanManage(!!cm);
      if (cm) {
        const { data: sl } = await supabase.from('bonus_sync_log').select('details').eq('sync_typ', 'close_spiegel').eq('ausloeser', 'cron').order('gestartet_am', { ascending: false }).limit(1).maybeSingle();
        const o = (sl?.details as any)?.offen;
        if (typeof o === 'number') setSpiegelOffen(o);
      }
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
    const { data: bm } = await supabase.from('bonus_monate').select('updated_at, status').eq('monat', monat).eq('mitarbeiter_id', maId).maybeSingle();
    setLastSaved(bm?.updated_at ?? null);
    setMonthStatus(bm?.status ?? null);
    return data as Result;
  };
  useEffect(() => { setApproval(null); setAcknowledged(false); setMonthStatus(null); setRes(null); run(false); }, [monat, maId]);

  const openApproval = async () => {
    const calculation = await run(true);
    if (calculation) { setAcknowledged(false); setApproval(calculation); }
  };
  const approve = async () => {
    if (!approval) return;
    setApproving(true);
    const { error } = await supabase.rpc('bonus_monat_freigeben', {
      _monat: monat, _mitarbeiter_id: maId, _berechnet_am: approval.berechnet_am,
      _unvollstaendig_bestaetigt: acknowledged,
    });
    setApproving(false);
    if (error) { toast.error('Freigabe fehlgeschlagen', { description: error.message }); return; }
    setApproval(null); setMonthStatus('freigegeben'); toast.success('Bonusmonat freigegeben');
  };

  const maName = mitarbeiter.find(m => m.id === maId)?.name;

  return (
    <PageShell>
      <PageHeader title="Bonus-Cockpit" description={canManage ? 'Monatliche Aufstellung je Kriterium (§ 5 Abs. 3 Bonusvereinbarung).' : `Deine monatliche Aufstellung${maName ? ` – ${maName}` : ''}.`} />
      {canManage && spiegelOffen > 0 && <a href="/bonus/spiegel" className="block mb-4 text-sm text-muted-foreground underline-offset-2 hover:underline"><span className="tabular-nums">{spiegelOffen}</span> Klienten aus Viral Connect warten auf Prüfung zur Übernahme →</a>}

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
            <p className="mt-3 text-xs text-muted-foreground tabular-nums">
              {res.nicht_bewertbare_kriterien} von 5 Kriterien haben keine vollständige Datengrundlage — Details je Kachel
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {ORDER.map(({ key, label }, i) => {
              const k = res.kriterien[key];
              return (
                <Button key={key} variant="ghost" onClick={() => setDetail(key)} className="h-auto min-w-0 p-0 text-left whitespace-normal block hover:bg-transparent">
                  <Card className="h-full transition-colors hover:border-primary/50">
                    <CardContent className="p-4 flex flex-col gap-3 h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{i + 1}. {label}</div>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">max {k.max}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums min-h-8">{wertText(key, k)}</div>
                      <div className="text-3xl font-semibold tabular-nums">{num(k.punkte)}</div>
                      <Progress value={k.max > 0 ? (k.punkte / k.max) * 100 : 0} />
                      <div className="min-h-4 min-w-0">
                        {k.basis_hinweis && <p title={k.basis_hinweis} className="text-xs font-normal text-muted-foreground truncate">{k.basis_hinweis}</p>}
                      </div>
                    </CardContent>
                  </Card>
                </Button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {canManage && (
          <Button onClick={() => run(true)} disabled={loading || !maId || monthStatus === 'freigegeben'}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Neu berechnen
          </Button>
        )}
        {canManage && monthStatus !== 'freigegeben' && <Button variant="outline" onClick={openApproval} disabled={loading || !res}>Monat freigeben</Button>}
        {monthStatus === 'freigegeben' && <span className="text-sm text-muted-foreground">Freigegeben</span>}
        <span className="text-sm text-muted-foreground tabular-nums">
          Zuletzt gespeichert: {lastSaved ? new Date(lastSaved).toLocaleString('de-DE') : 'noch nie'}
        </span>
      </div>
      {maId && <CheckinKandidaten monat={monat} maId={maId} canManage={!!canManage} onChanged={() => canManage && run(true)} />}


      <Sheet open={!!detail} onOpenChange={o => !o && setDetail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
          {detail && <Detail kind={detail} monat={monat} maId={maId} res={res} canManage={!!canManage} onChanged={() => run(true)} />}
        </SheetContent>
      </Sheet>
      <AlertDialog open={!!approval} onOpenChange={open => { if (!open && !approving) setApproval(null); }}>
        <AlertDialogContent className="z-[400]">
          <AlertDialogHeader>
            <AlertDialogTitle>Bonusmonat freigeben?</AlertDialogTitle>
            <AlertDialogDescription>
              {maName} · {new Date(monat).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} · {num(approval?.punkte_gesamt)} Punkte · {eur(approval?.bonus_eur)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {approval && !approval.kriterien.churn.wert?.erfassung_bestaetigt && <p className="text-sm text-destructive">Bestätige zuerst die Churn-Erfassung in den Anti-Churn-Details. {num(approval.kriterien.churn.punkte)} Punkte werden dadurch final.</p>}
          {approval && approval.nicht_bewertbare_kriterien > 0 && <div className="space-y-4 text-sm">
            <p>Diese Kriterien haben keine vollständige Datengrundlage:</p>
            <ul className="space-y-2">{ORDER.filter(o => approval.kriterien[o.key].status !== 'ok').map(o => <li key={o.key}><span className="font-medium">{o.label}</span><p className="text-xs text-muted-foreground">{approval.kriterien[o.key].basis_hinweis}</p></li>)}</ul>
            <label className="flex items-start gap-3"><Checkbox checked={acknowledged} onCheckedChange={v => setAcknowledged(v === true)} aria-label="Unvollständige Datengrundlage ausdrücklich bestätigen" />
              <span>Ich bestätige ausdrücklich die Freigabe trotz unvollständiger Datengrundlage und der dadurch gegebenenfalls mit 0 bewerteten Kriterien.</span>
            </label>
          </div>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approving}>Abbrechen</AlertDialogCancel>
            <Button onClick={approve} disabled={approving || !approval?.kriterien.churn.wert?.erfassung_bestaetigt || (!!approval?.nicht_bewertbare_kriterien && !acknowledged)}>{approving && <Loader2 className="h-4 w-4 animate-spin" />}Freigeben</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [syncing, setSyncing] = useState(false);
  const sync = async () => {
    setSyncing(true);
    const { data: r, error } = await supabase.functions.invoke('bonus-checkins-sync', { body: { monat, mitarbeiter_id: maId } });
    setSyncing(false);
    if (error || !r?.ok) {
      let msg = r?.error || error?.message;
      try { const b = await (error as any)?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
      toast.error('Sync fehlgeschlagen', { description: msg });
    } else toast.success(`${r.gefunden} Calls gefunden, ${r.neu} neu`);
    setTick(t => t + 1); onChanged();
  };
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
        const { data: t } = await supabase.from('bonus_kunden_snapshot').select('client_id, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId);
        const toks = (t as any[]) || [];
        const { data: a } = await supabase.from('bonus_survey_antworten').select('*').eq('monat', monat).eq('mitarbeiter_id', maId).in('zuordnung_status', ['automatisch', 'manuell']);
        setData({ toks, ans: (a as any[]) || [] });
      } else if (kind === 'cash_niveau' || kind === 'cash_entwicklung') {
        const { data: c } = await supabase.from('bonus_cash_collect').select('id, betrag, eingang_am, quelle, zugeordnet, mitarbeiter_id, clients:client_id(name)').eq('monat', monat).or(`mitarbeiter_id.eq.${maId},zugeordnet.eq.false`).order('eingang_am');
        setData({ rows: (c as any[]) || [] });
      } else if (kind === 'churn') {
        const { data: c } = await supabase.from('bonus_churn_events').select('id, typ, zaehlt_als_churn, bemerkung, festgestellt_am, abgang_datum, kuendigungsdatum, letzter_vertragstag, freigabe_status, close_lead_id, close_opportunity_id, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId).order('abgang_datum');
        const { count } = await supabase.from('bonus_kunden_snapshot').select('id', { count: 'exact', head: true }).eq('monat', monat).eq('mitarbeiter_id', maId);
        const { data: frg } = await supabase.from('bonus_monat_freigaben').select('churn_erfassung_abgeschlossen, churn_bestaetigt_am').eq('monat', monat).eq('mitarbeiter_id', maId).maybeSingle();
        setData({ rows: (c as any[]) || [], snap: count ?? 0, frg });
      } else {
        const { data: c } = await supabase.from('bonus_checkins').select('close_activity_id, client_id, datum, quelle, stimmung, anlass, kampagne_nach_erwartung, upsell_potenzial, naechster_schritt, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId).order('datum');
        const { data: sn } = await supabase.from('bonus_kunden_snapshot').select('client_id, clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId);
        const { data: lg } = await supabase.from('bonus_sync_log').select('ausloeser, gestartet_am, beendet_am, ok, gefunden, neu, fehler, nicht_zuordenbar').eq('sync_typ', 'checkins').eq('monat', monat).eq('mitarbeiter_id', maId).order('gestartet_am', { ascending: false }).limit(1);
        setData({ rows: (c as any[]) || [], snap: (sn as any[]) || [], log: (lg as any[])?.[0] ?? null });
      }
    })();
  }, [kind, monat, maId, tick]);

  const title = ORDER.find(o => o.key === kind)?.label;
  const k = res?.kriterien[kind];

  const nichtGeantwortet = useMemo(() => {
    if (kind !== 'zufriedenheit' || !data) return [];
    const answered = new Set(data.ans.map((a: any) => a.client_id));
    return data.toks.filter((t: any) => !answered.has(t.client_id));
  }, [data, kind]);

  return (
    <>
      <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
      {k && k.status !== 'ok' && <p className="mt-2 text-sm text-muted-foreground">{k.hinweis}</p>}
      <div className="mt-4 space-y-6">
        {!data && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

        {data && kind === 'zufriedenheit' && (() => {
          const nameOf = (clientId: string) => data.toks.find((t: any) => t.client_id === clientId)?.clients?.name || '–';
          return (
            <>
              <Table
                head={['Kunde', 'Kontakt', 'Datum', 'B1', 'B2', 'B3', 'B4', 'L1', 'L2', 'L3', 'Score Betreuung', <span className="text-muted-foreground/70">Score Leistung (nicht bonusrelevant)</span>, 'Freitext']}
                rows={data.ans.map((a: any) => [nameOf(a.client_id), a.kontaktname, dt(a.created_at), a.b1_reaktionszeit, a.b2_umgang, a.b3_verbindlichkeit, a.b4_eigeninitiative, a.l1_anfragemenge, a.l2_anfragequalitaet, a.l3_weiterempfehlung,
                  <b>{num(Number(a.score_betreuung))}</b>, <span className="text-muted-foreground/70">{num(Number(a.score_leistung))}</span>, <span className="font-sans text-xs">{a.freitext || '–'}</span>])}
                empty="Noch keine Einsendungen."
              />
              <div>
                <h3 className="text-sm font-medium mb-2">Nicht geantwortet ({nichtGeantwortet.length})</h3>
                <Table head={['Kunde']} rows={nichtGeantwortet.map((t: any) => [t.clients?.name || '–'])} empty="Alle haben geantwortet." />
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

        {data && kind === 'churn' && (() => {
          const offen = data.rows.filter((r: any) => r.freigabe_status === 'offen');
          const luecken = data.rows.filter((r: any) => !r.kuendigungsdatum || !(r.bemerkung || '').trim());
          const blockiert = offen.length > 0 || luecken.length > 0;
          const typLabel: Record<string, string> = { abbruch: 'Laufzeit abgebrochen', planmaessiges_ende: 'Laufzeit regulär beendet', kuendigung_arbeitgeber: 'Vorzeitig entlassen (durch uns)', insolvenz: 'Insolvenz / Geschäftsaufgabe', ausserhalb_verantwortung: 'Sonderfall (außerhalb Verantwortung)', kuendigung_kunde: 'Kündigung Kunde' };
          const decide = async (id: string, anerkennen: boolean) => {
            const { data: u } = await supabase.auth.getUser();
            const { error } = await supabase.from('bonus_churn_events').update({ freigabe_status: anerkennen ? 'freigegeben' : 'abgelehnt', zaehlt_als_churn: !anerkennen, freigegeben_von: u.user?.id ?? null, freigegeben_am: new Date().toISOString() }).eq('id', id);
            if (error) return toast.error(error.message);
            toast.success(anerkennen ? 'Als Sonderfall anerkannt' : 'Zählt als Churn');
            setTick(t => t + 1); onChanged();
          };
          return <>
            {canManage && offen.length > 0 && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Sonderfälle mit offener Freigabe ({offen.length})</h3>
                {offen.map((r: any) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{r.clients?.name || '–'} · <span className="tabular-nums">{dt(r.abgang_datum || r.festgestellt_am)}</span></span>
                    <span className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, true)}>Als Sonderfall anerkennen</Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, false)}>Zählt als Churn</Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {luecken.length > 0 && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
                <h3 className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Angaben unvollständig ({luecken.length})</h3>
                {luecken.map((r: any) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{r.clients?.name || '–'} · <span className="text-muted-foreground">fehlt: {[!r.kuendigungsdatum && 'Kündigungsdatum', !(r.bemerkung || '').trim() && 'Begründung'].filter(Boolean).join(', ')}</span></span>
                    {r.close_lead_id && <a className="text-primary underline-offset-2 hover:underline" href={`https://app.close.com/lead/${r.close_lead_id}/${r.close_opportunity_id ? `?opportunity=${r.close_opportunity_id}` : ''}`} target="_blank" rel="noreferrer">In Close öffnen</a>}
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg border border-border p-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Churn-Erfassung für diesen Monat abgeschlossen</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.frg?.churn_erfassung_abgeschlossen
                    ? `Bestätigt am ${data.frg.churn_bestaetigt_am ? new Date(data.frg.churn_bestaetigt_am).toLocaleString('de-DE') : '–'}`
                    : blockiert ? `Erst möglich, wenn ${[offen.length && 'alle Sonderfälle entschieden', luecken.length && `die Angaben vollständig sind (${luecken.map((r: any) => r.clients?.name || '–').join(', ')})`].filter(Boolean).join(' und ')}.` : `Bestätigung ausstehend — ${num(k?.punkte)} Punkte zählen bereits zur Gesamtsumme.`}
                </div>
              </div>
              {canManage && <Switch checked={!!data.frg?.churn_erfassung_abgeschlossen} disabled={!data.frg?.churn_erfassung_abgeschlossen && blockiert} onCheckedChange={v => setConfirm(v)} />}
            </div>
            <p className="text-sm tabular-nums">Nenner: <b>{data.snap}</b> betreute Kunden im Snapshot zum Stichtag {new Date(monat).toLocaleDateString('de-DE')}</p>
            <Table head={['Kunde', 'Abgangsart', 'Datum', 'Kündigungsdatum', 'Letzter Vertragstag', 'Begründung', 'Zählt als Churn']}
              rows={data.rows.map((r: any) => [r.clients?.name || '–', typLabel[r.typ] || r.typ, dt(r.abgang_datum || r.festgestellt_am), dt(r.kuendigungsdatum), dt(r.letzter_vertragstag), <span className="font-sans text-xs">{r.bemerkung || '–'}</span>, (r.zaehlt_als_churn ? 'Ja' : 'Nein') + (r.freigabe_status === 'offen' ? ' (Freigabe offen)' : '')])}
              empty="Keine Abgänge in diesem Monat." />
            <AlertDialog open={confirm !== null} onOpenChange={o => !o && setConfirm(null)}>
              <AlertDialogContent className="z-[400]">
                <AlertDialogHeader>
                  <AlertDialogTitle>{confirm ? 'Churn-Erfassung bestätigen?' : 'Bestätigung zurücknehmen?'}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {confirm
                      ? `Du bestätigst, dass alle Kündigungen und Abbrüche für ${new Date(monat).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })} erfasst sind und die Liste vollständig ist. ${num(k?.punkte)} Anti-Churn-Punkte werden dadurch final; sie zählen bereits zur Gesamtsumme.`
                      : 'Die Punkte zählen weiter zur Gesamtsumme. Die Datengrundlage wird wieder als unvollständig geführt; die Monatsfreigabe ist gesperrt.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={() => saveFreigabe(!!confirm)}>{confirm ? 'Ja, Liste ist vollständig' : 'Zurücknehmen'}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>;
        })()}

        {data && kind === 'calls' && <>
          {k?.wert && <p className="text-sm tabular-nums">Erreichungsgrad: <b>{k.wert.erreichungsgrad_prozent != null ? `${num(k.wert.erreichungsgrad_prozent)} %` : '–'}</b> · {num(k.wert.gewichtete_summe)} von {k.wert.zielwert} gewichtet · {k.wert.anzahl_calls} Calls bei {k.wert.eindeutige_kunden} Kunden · {k.wert.abgewertete_checkins} abgewertet</p>}
          <CallsDetail data={data} canManage={canManage} syncing={syncing} onSync={sync} wert={k?.wert} />
        </>}
      </div>
    </>
  );
}

const isRisk = (s: string | null) => !!s && /abwanderung|unzufrieden/i.test(s);
const isHandover = (s: string | null) => !!s && /übergeben|uebergeben/i.test(s);

function CallsDetail({ data, canManage, syncing, onSync, wert }: { data: any; canManage: boolean; syncing: boolean; onSync: () => void; wert?: any }) {
  const rows: any[] = data.rows;
  const gewichte: Record<string, any> = wert?.gewichte || {};
  const wochen: any[] = wert?.wochen || [];
  const anlass = Object.entries(rows.reduce((m: Record<string, number>, r) => { const k = r.anlass || 'Ohne Anlass'; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => (b[1] as number) - (a[1] as number));
  const risk = rows.filter(r => isRisk(r.stimmung));
  const handover = rows.filter(r => isHandover(r.upsell_potenzial));
  const withCall = new Set(rows.map(r => r.client_id));
  const ohne = (data.snap as any[]).filter(s => !withCall.has(s.client_id));
  const log = data.log;
  const nz: any[] = Array.isArray(log?.nicht_zuordenbar) ? log.nicht_zuordenbar : [];
  return (
    <>
      <div className="rounded-lg border border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground tabular-nums">
          {log ? (
            <>Letzter Sync ({log.ausloeser}): {new Date(log.gestartet_am).toLocaleString('de-DE')} ·{' '}
              {log.ok === null ? 'läuft …' : log.ok ? <>erfolgreich, {log.gefunden} Calls</> : <span className="text-destructive">fehlgeschlagen: {log.fehler}</span>}</>
          ) : 'Noch nie synchronisiert.'}
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={onSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Jetzt synchronisieren
          </Button>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Nicht erreichbare Kunden ({nz.length} von {data.snap.length})</h3>
        <Table head={['Kunde', 'Grund']} rows={nz.map(n => [n.name || '–', <span className="text-xs text-muted-foreground">{n.grund || '–'}</span>])} empty="Alle betreuten Kunden sind in Close erreichbar." />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Verteilung nach Anlass</h3>
        <div className="flex flex-wrap gap-2">
          {anlass.length ? anlass.map(([k, v]) => (
            <div key={k} className="rounded-md border border-border px-3 py-2 text-sm"><span className="text-muted-foreground">{k}</span> <b className="tabular-nums ml-1">{v as number}</b></div>
          )) : <span className="text-sm text-muted-foreground">Keine Calls.</span>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Frühwarnung Churn ({risk.length})</h3>
          <p className="text-xs text-muted-foreground mb-2">Stimmung „Abwanderungsgefahr" oder „Unzufrieden" — nicht punkterelevant.</p>
          {risk.length ? <ul className="text-sm space-y-1">{risk.map((r, i) => <li key={i}>{r.clients?.name || '–'} <span className="text-muted-foreground tabular-nums">· {dt(r.datum)} · {r.stimmung}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Keine.</p>}
        </div>
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          <h3 className="text-sm font-medium mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" />Upsell übergeben ({handover.length})</h3>
          <p className="text-xs text-muted-foreground mb-2">Kandidaten für die Upsell-Beteiligung nach § 7 — nicht punkterelevant.</p>
          {handover.length ? <ul className="text-sm space-y-1">{handover.map((r, i) => <li key={i}>{r.clients?.name || '–'} <span className="text-muted-foreground tabular-nums">· {dt(r.datum)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Keine.</p>}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Wochenübersicht (ISO-Wochen)</h3>
        <Table head={['Woche', 'Kunden erreicht', 'Checkins', 'Gewichtete Summe']}
          rows={wochen.map((w: any) => [w.woche, w.kunden_erreicht, w.checkins, num(w.gewichtete_summe)])}
          empty="Keine Checkins in diesem Monat." />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Alle Calls ({rows.length})</h3>
        <Table head={['Kunde', 'Datum', 'Gewicht', 'Anlass', 'Stimmung', 'Kampagne nach Erwartung', 'Upsell-Potenzial', 'Nächster Schritt']}
          rows={rows.map(r => {
            const g = gewichte[r.close_activity_id];
            const why = !g ? 'Noch nicht berechnet — „Neu berechnen" ausführen.' : g.nr_in_woche === 1 ? `Erster Checkin dieses Kunden in ${g.woche}.` : `${g.nr_in_woche}. Checkin dieses Kunden in ${g.woche} — abgewertet nach Wochenregel.`;
            return [r.clients?.name || '–', dt(r.datum),
              <span title={why} className={`cursor-help underline decoration-dotted ${g && g.gewicht < 1 ? 'text-muted-foreground' : ''}`}>{g ? g.gewicht.toLocaleString('de-DE', { minimumFractionDigits: 1 }) : '–'}</span>,
              r.anlass || '–', r.stimmung || '–', r.kampagne_nach_erwartung || '–', r.upsell_potenzial || '–', <span className="text-xs">{r.naechster_schritt || '–'}</span>];
          })}
          empty="Keine Checkup-Calls erfasst." />
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Betreute Kunden ohne Checkin ({ohne.length})</h3>
        <Table head={['Kunde']} rows={ohne.map(s => [s.clients?.name || '–'])} empty="Alle betreuten Kunden hatten einen Checkin." />
      </div>

    </>
  );
}
