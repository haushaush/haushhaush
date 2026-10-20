// Karte „Meta" im Verknüpfungen-Tab. Kern ist die Kampagnen-/Anzeigengruppen-Zuordnung auf unseren Untermarken;
// die Kontoverknüpfung entsteht daraus automatisch. Eigene Kundenkonten (nur Reporting) sind getrennt.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle, Check, ChevronRight, ExternalLink, Plus, X } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { ladeZahlungsstatus, ZAHLUNGSSTATUS_TEXT, OHNE_POSTEN_TOOLTIP, type WerbebudgetZahlungsstatus } from '@/lib/werbebudgetZahlungsstatus';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type SystemKey, type SystemStand, type KundeMin, type Objekt, verknuepfen, verwerfen, loesen, portalMeta } from '@/lib/kundenVerknuepfungen';
import { ladeUntermarken, STATUS_LABEL, suchKey, type Untermarke } from '@/lib/werbebudgetKonten';
import { KontoCombobox } from '@/components/kunden/KontoCombobox';
import { KampagneZeile, useWerbebudgetZuordnung, type Zuo, type ZuoKampagne } from './werbebudgetZuordnung';
import { LeadSharksSteuerung, ZuweisenAssistent, ZuordnungErgebnis, fehlerMeldung, type LeadTyp } from './LeadSharksMeta';
import { SuchFeld } from './PortalAuswahl';

const ohneAct = (id: string) => id.replace(/^act_/, '');
const eur = (v: any) => v == null ? '—' : `€${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;
const actUrl = (id: string) => `https://business.facebook.com/adsmanager/manage/campaigns?act=${ohneAct(id)}`;

function useLeadSharks(profileId: string | null) {
  const [daten, setDaten] = useState<{ kampagnen: any[]; formulare: any[]; lead_typen: LeadTyp[] } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(async () => {
    if (!profileId) { setDaten(null); return; }
    setFehler(null);
    try {
      const r = await portalMeta('meta_get', { profile_id: profileId });
      if (!r?.ok) { setFehler(fehlerMeldung(r)); return; }
      setDaten({ kampagnen: r.kampagnen || [], formulare: r.formulare || [], lead_typen: r.lead_typen || [] });
    } catch (e: any) { setFehler(fehlerMeldung({ error: e?.message })); }
  }, [profileId]);
  useEffect(() => { laden(); }, [laden]);
  return { daten, fehler, laden };
}

/** Budgetstand aus der View werbebudget_eingezahlt; Fehler werden sichtbar gemacht. */
function useBudgetstand(clientId: string, aktiv: boolean) {
  const [budget, setBudget] = useState<any[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [status, setStatus] = useState<WerbebudgetZahlungsstatus | null>(null);
  useEffect(() => {
    setBudget(null); setFehler(null); setStatus(null);
    if (!aktiv) return;
    ladeZahlungsstatus([clientId]).then(m => setStatus(m.get(clientId) ?? null));
    (supabase.from as any)('werbebudget_eingezahlt').select('quelle, eingezahlt_netto, offen_netto, rechnungen_offen, aelteste_ueberfaellig, letzte_zahlung').eq('client_id', clientId)
      .then(({ data, error }: any) => { if (error) setFehler(`Budgetstand konnte nicht geladen werden: ${error.message}`); else setBudget(data || []); },
        (e: any) => setFehler(`Budgetstand konnte nicht geladen werden: ${e?.message || 'Verbindung unterbrochen'}`));
  }, [clientId, aktiv]);
  return { budget, fehler, status };
}

/** werbebudget_zuordnung nur Admin oder finanzen.view. */
function useMetaRechte() {
  const { isAdmin, hasPermission, loading } = usePermissions();
  return { loading, budget: isAdmin || hasPermission('finanzen.view') };
}

type KundenKonto = { meta_account_id: string; meta_account_name: string | null; match_type: string | null };
function useKundenKonten(clientId: string) {
  const [konten, setKonten] = useState<KundenKonto[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const laden = useCallback(async () => {
    setFehler(null);
    try {
      const { data, error } = await supabase.from('kunde_meta_accounts').select('meta_account_id, meta_account_name, match_type')
        .eq('client_id', clientId).order('matched_at', { ascending: false });
      if (error) { setFehler(`Werbekonten konnten nicht geladen werden: ${error.message}`); return; }
      setKonten((data || []).map((r: any) => ({ ...r, meta_account_id: String(r.meta_account_id) })));
    } catch (e: any) { setFehler(`Werbekonten konnten nicht geladen werden: ${e?.message || 'Verbindung unterbrochen'}`); }
  }, [clientId]);
  useEffect(() => { laden(); }, [laden]);
  return { konten, fehler, laden };
}

/** Unsere Untermarken-Konten (aktiv, < 30 Tage synchronisiert). */
function useUntermarken() {
  const [liste, setListe] = useState<Untermarke[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => { ladeUntermarken(null).then(setListe, (e: Error) => { setFehler(e.message); setListe([]); }); }, []);
  return { liste, fehler };
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  return <span className={cn('text-xs font-medium flex items-center gap-1.5', ok ? 'text-success' : 'text-muted-foreground')}><span className="h-1.5 w-1.5 rounded-full bg-current" />{text}</span>;
}
function Fehler({ text }: { text: string }) {
  return <p className="text-xs text-destructive flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{text}</p>;
}

function BudgetStand({ budget, fehler, status }: { budget: any[] | null; fehler: string | null; status: WerbebudgetZahlungsstatus | null }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Budgetstand dieses Kunden</p>
      {fehler ? <Fehler text={fehler} /> : <>
        {!budget && <Skeleton className="h-16 rounded-xl" />}
        {budget?.length === 0 && <p className="text-xs text-muted-foreground" title={status === 'verknuepft_ohne_werbebudgetposten' ? OHNE_POSTEN_TOOLTIP : undefined}>
          {status && status !== 'werbebudget_vorhanden' ? ZAHLUNGSSTATUS_TEXT[status] : 'Kein Budgetstand vorhanden.'}</p>}
        {budget?.map((b, i) => {
          const warn = Number(b.rechnungen_offen || 0) > 0 || !!b.aelteste_ueberfaellig;
          return (
            <div key={i} className={cn('rounded-xl border p-3 text-sm space-y-2', warn ? 'border-warning/40 bg-warning/10' : 'border-border')}>
              {warn && <p className="flex items-start gap-1.5 text-sm font-medium"><AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                {Number(b.rechnungen_offen || 0)} offene Rechnung(en){b.aelteste_ueberfaellig ? ` · überfällig seit ${new Date(b.aelteste_ueberfaellig).toLocaleDateString('de-DE')}` : ''}</p>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
                <div><p className="text-xs text-muted-foreground">Eingezahlt (netto)</p><p>{eur(b.eingezahlt_netto)}</p></div>
                <div><p className="text-xs text-muted-foreground">Offen (netto)</p><p>{eur(b.offen_netto)}</p></div>
                <div><p className="text-xs text-muted-foreground">Offene Rechnungen</p><p>{b.rechnungen_offen ?? '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Letzte Zahlung</p><p>{b.letzte_zahlung ? new Date(b.letzte_zahlung).toLocaleDateString('de-DE') : '—'}</p></div>
              </div>
              {b.quelle && <p className="text-xs text-muted-foreground">Quelle: {b.quelle}</p>}
            </div>
          );
        })}
      </>}
    </div>
  );
}

type SuchKampagne = ZuoKampagne & { konto: Untermarke };

/** Lädt live alle Kampagnen der angegebenen Konten (mit Ausgaben der letzten 7 Tage). */
function useKampagnen(konten: Untermarke[] | null) {
  const { callMeta } = useMetaAds();
  const [liste, setListe] = useState<SuchKampagne[] | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  useEffect(() => {
    if (!konten) return;
    let ab = false;
    setListe(null); setFehler([]);
    Promise.all(konten.map(k => callMeta<any>(`/${k.meta_account_id}/campaigns`, { fields: 'id,name,effective_status,daily_budget,insights.date_preset(last_7d){spend}', limit: 500 })
      .then(r => ({ k, data: (r?.data || []) as ZuoKampagne[], err: null as string | null }), (e: Error) => ({ k, data: [] as ZuoKampagne[], err: `${k.name || k.meta_account_id}: ${e?.message || 'Fehler'}` }))))
      .then(rs => {
        if (ab) return;
        setFehler(rs.map(r => r.err).filter(Boolean) as string[]);
        const alle = rs.flatMap(r => r.data.map(c => ({ ...c, konto: r.k })));
        // Aktive zuerst, dann nach Ausgaben 7 Tage.
        alle.sort((a, b) => Number(b.effective_status === 'ACTIVE') - Number(a.effective_status === 'ACTIVE')
          || Number(b.insights?.data?.[0]?.spend || 0) - Number(a.insights?.data?.[0]?.spend || 0) || a.name.localeCompare(b.name));
        setListe(alle);
      });
    return () => { ab = true; };
  }, [konten, callMeta]);
  return { liste, fehler, callMeta };
}

const MAX_ZEILEN = 60;

/** Suchliste über alle Kampagnen; Konto ist nur Filter. */
function KampagnenSuche({ konten, render }: { konten: Untermarke[] | null; render: (c: SuchKampagne) => React.ReactNode }) {
  const k = useKampagnen(konten);
  const [q, setQ] = useState('');
  const [konto, setKonto] = useState('');
  const treffer = useMemo(() => {
    const s = suchKey(q);
    return (k.liste || []).filter(c => (!konto || c.konto.meta_account_id === konto) && (!s || suchKey(`${c.name} ${c.id} ${c.konto.name || ''} ${c.konto.meta_account_id}`).includes(s)));
  }, [k.liste, q, konto]);
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Kampagne suchen…" className="h-9 bg-muted/50 border-0" />
        <KontoCombobox konten={konten || []} value={konto} onChange={setKonto} alleText="Alle Untermarken" className="sm:w-64" />
      </div>
      {k.fehler.length > 0 && <Fehler text={`Kampagnen einzelner Konten konnten nicht geladen werden – ${k.fehler.join(' · ')}`} />}
      {!k.liste && <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>}
      {k.liste && treffer.length === 0 && <p className="text-sm text-muted-foreground">Keine Kampagnen gefunden.</p>}
      {treffer.length > 0 && (
        <div className="divide-y divide-border/40 rounded-xl bg-muted/20">
          {treffer.slice(0, MAX_ZEILEN).map(c => <div key={c.id}>{render(c)}</div>)}
        </div>
      )}
      {treffer.length > MAX_ZEILEN && <p className="text-xs text-muted-foreground">{treffer.length - MAX_ZEILEN} weitere – Suche eingrenzen.</p>}
    </div>
  );
}

export function MetaKarte({ kunde, stand, onChanged }: { kunde: KundeMin; stand: Record<SystemKey, SystemStand>; onChanged: () => void }) {
  const wb = useWerbebudgetZuordnung(kunde.id);
  const profileId = stand.portal?.zustand === 'verknuepft' ? stand.portal.objekt.id : null;
  const ls = useLeadSharks(profileId);
  const rechte = useMetaRechte();
  const kk = useKundenKonten(kunde.id);
  const um = useUntermarken();
  const [verknuepfenOffen, setVerknuepfenOffen] = useState(false);
  const [lsOffen, setLsOffen] = useState(false);
  const [lsAuf, setLsAuf] = useState(false);
  const [eigenSuche, setEigenSuche] = useState(false);
  const [loeseZiel, setLoeseZiel] = useState<Objekt | null>(null);
  const [loeseZuo, setLoeseZuo] = useState<Zuo | null>(null);
  const [busy, setBusy] = useState(false);

  const meta = stand.meta;
  const unsereIds = useMemo(() => new Set((um.liste || []).map(u => u.meta_account_id)), [um.liste]);
  const eigene = wb.alle.filter(z => z.client_id === kunde.id);
  const zuoKonten = new Set(eigene.map(z => z.meta_account_id));
  const gruppen = eigene.reduce<Record<string, Zuo[]>>((acc, z) => { (acc[z.untermarke || z.meta_account_id] ||= []).push(z); return acc; }, {});
  const kontenListe = kk.konten || [];
  // Eigenes Kundenkonto = verknüpftes Konto, das keines unserer Untermarken-Konten ist und keine Zuordnung trägt.
  const eigeneKonten = kontenListe.filter(k => !unsereIds.has(k.meta_account_id) && !zuoKonten.has(k.meta_account_id));
  // Untermarken-Konten ohne Kampagnenzuordnung (Altbestand) – sichtbar, damit sie gelöst oder ergänzt werden können.
  const ohneKampagne = kontenListe.filter(k => unsereIds.has(k.meta_account_id) && !zuoKonten.has(k.meta_account_id));
  const nKo = eigene.filter(z => z.typ === 'konto').length, nK = eigene.filter(z => z.typ === 'kampagne').length, nA = eigene.filter(z => z.typ === 'adset').length;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); kk.laden(); }
    catch (e: any) { toast.error(e.message || 'Fehlgeschlagen'); }
    finally { setBusy(false); }
  };
  const zuoLoesen = async (z: Zuo) => { await wb.loesen(z); kk.laden(); onChanged(); };

  const lsKampagnen = ls.daten?.kampagnen.length ?? 0;
  const laedt = rechte.loading || !um.liste || (!kk.konten && !kk.fehler) || (rechte.budget && !wb.geladen);

  // Statuszeile Werbebudget ist Ergebnis der Kampagnen-Zuordnung, kein eigener Konfigurationspunkt.
  const budgetZeile = !rechte.budget ? <span className="text-xs text-muted-foreground">Werbebudget-Zuordnung für dein Konto nicht sichtbar</span>
    : wb.fehler ? <Fehler text={wb.fehler} />
    : eigene.length ? <Status ok text={[nKo && `${nKo} ${nKo === 1 ? 'ganzes Konto' : 'ganze Konten'}`, nK && `${nK} ${nK === 1 ? 'Kampagne' : 'Kampagnen'}`, nA && `${nA} ${nA === 1 ? 'Anzeigengruppe' : 'Anzeigengruppen'}`].filter(Boolean).join(', ') + ' zugeordnet'} />
    : <span className="text-xs text-muted-foreground">Kein Werbebudget zuordenbar — <button className="underline hover:text-primary" onClick={() => setVerknuepfenOffen(true)}>Kampagne verknüpfen</button></span>;

  const bs = useBudgetstand(kunde.id, rechte.budget && eigene.length > 0);

  if (laedt) return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-sm font-medium">Meta</p>
      <Skeleton className="h-16 rounded-xl" />
    </div>
  );

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Meta</p>
          {budgetZeile}
        </div>
        {rechte.budget && !wb.fehler && <Button size="sm" variant="outline" onClick={() => setVerknuepfenOffen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Kampagne verknüpfen</Button>}
      </div>
      {um.fehler && <Fehler text={um.fehler} />}
      {kk.fehler && <Fehler text={kk.fehler} />}

      {/* Untermarken-Zuordnungen */}
      {rechte.budget && !wb.fehler && (Object.keys(gruppen).length > 0 || ohneKampagne.length > 0) && (
        <div className="space-y-3">
          {Object.entries(gruppen).map(([marke, zs]) => (
            <div key={marke}>
              <p className="text-xs font-medium mb-1">{marke}</p>
              {zs.map(z => (
                <div key={z.id} className="flex items-center gap-3 text-sm py-1 pl-3">
                  <span className="text-xs text-muted-foreground w-28 shrink-0">{z.typ === 'konto' ? 'Ganzes Konto' : z.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'}</span>
                  <span className="truncate flex-1 min-w-0">{z.objekt_name || z.objekt_id}</span>
                  <button disabled={wb.busy === z.id} onClick={() => setLoeseZuo(z)} title="Zuordnung lösen" className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          ))}
          {ohneKampagne.map(k => (
            <div key={k.meta_account_id} className="rounded-lg bg-muted/40 px-3 py-2 text-xs flex flex-wrap items-center gap-2">
              <span className="flex-1 min-w-0"><span className="font-medium">{k.meta_account_name || k.meta_account_id}</span> ist verknüpft, aber ohne Kampagne – darüber ist kein Budget zuordenbar.</span>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => setVerknuepfenOffen(true)}>Kampagne verknüpfen</Button>
              <Button size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => setLoeseZiel({ id: k.meta_account_id, name: k.meta_account_name } as Objekt)}>Lösen</Button>
            </div>
          ))}
          {eigene.length > 0 && <BudgetStand budget={bs.budget} fehler={bs.fehler} status={bs.status} />}
        </div>
      )}

      {/* Eigenes Werbekonto des Kunden – nur Reporting */}
      <div className="rounded-xl border border-dashed border-border p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium">Eigenes Werbekonto des Kunden</p>
            <p className="text-xs text-muted-foreground">Nur für Reporting – der Kunde zahlt Meta direkt, hierüber wird kein Werbebudget abgerechnet.</p>
          </div>
          {!eigenSuche && <Button size="sm" variant="ghost" onClick={() => setEigenSuche(true)}><Plus className="h-3.5 w-3.5 mr-1" />Verknüpfen</Button>}
        </div>
        {eigeneKonten.map(k => (
          <div key={k.meta_account_id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{k.meta_account_name || '(ohne Namen)'}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{k.meta_account_id}</span>
            <a href={actUrl(k.meta_account_id)} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary" title="In Meta öffnen"><ExternalLink className="h-3.5 w-3.5" /></a>
            <Button size="sm" variant="ghost" disabled={busy} className="ml-auto text-muted-foreground hover:text-destructive" onClick={() => setLoeseZiel({ id: k.meta_account_id, name: k.meta_account_name } as Objekt)}>Verknüpfung lösen</Button>
          </div>
        ))}
        {meta?.zustand === 'vorschlag' && !unsereIds.has(meta.vorschlag.id) && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 text-sm flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs">Vorschlag: {meta.vorschlag.name || meta.vorschlag.id}</p>
              <p className="text-xs text-muted-foreground">{meta.vorschlag.grund}</p>
            </div>
            <Button size="sm" disabled={busy} onClick={() => run(() => verknuepfen('meta', kunde.id, meta.vorschlag), 'Eigenes Werbekonto verknüpft')}><Check className="h-3.5 w-3.5 mr-1" />Übernehmen</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => verwerfen(meta.vorschlag, kunde.id), 'Vorschlag verworfen')}>Verwerfen</Button>
          </div>
        )}
        {eigenSuche && (
          <div className="[&>div]:sm:ml-0 [&>div]:mt-0">
            <SuchFeld system="meta" clientId={kunde.id} label="Meta Ads" onPick={o => {
              setEigenSuche(false);
              if (unsereIds.has(o.id)) { toast.error(`„${o.name || o.id}“ ist eine unserer Untermarken – bitte über „Kampagne verknüpfen“ zuordnen.`); return; }
              run(() => verknuepfen('meta', kunde.id, o), 'Eigenes Werbekonto verknüpft');
            }} />
          </div>
        )}
      </div>

      {/* LeadSharks – unverändert */}
      <div>
        <button onClick={() => setLsAuf(v => !v)} aria-expanded={lsAuf}
          className="w-full grid grid-cols-[16px_1fr] sm:grid-cols-[16px_124px_130px_1fr] gap-1 sm:gap-4 items-center text-left py-1 hover:text-primary">
          <ChevronRight className={cn('h-4 w-4 transition-transform', lsAuf && 'rotate-90')} />
          <span className="text-xs text-muted-foreground">LeadSharks</span>
          <span className="hidden sm:flex"><Status ok={!!profileId && !ls.fehler && lsKampagnen > 0}
            text={!profileId ? 'Portalkonto fehlt' : ls.fehler ? 'Fehler' : ls.daten ? (lsKampagnen ? 'Eingerichtet' : 'Nicht eingerichtet') : 'Lädt …'} /></span>
          <span className="hidden sm:block text-xs truncate text-foreground">{!profileId ? 'Portalkonto fehlt' : ls.fehler ? ls.fehler : ls.daten ? `${lsKampagnen} Kampagnen, ${ls.daten.formulare.length} Formulare` : '…'}</span>
        </button>
        {lsAuf && (
          <div className="pl-6 pt-2 space-y-3">
            {!profileId && <p className="text-xs text-muted-foreground">Für LeadSharks fehlt noch das Portalkonto dieses Kunden.</p>}
            {profileId && ls.fehler && <Fehler text={ls.fehler} />}
            {profileId && !ls.daten && !ls.fehler && <Skeleton className="h-16 rounded-xl" />}
            {profileId && !ls.fehler && ls.daten && lsKampagnen === 0 && <p className="text-xs text-muted-foreground">Diesem Kunden ist noch keine Meta-Kampagne zugewiesen.</p>}
            {profileId && !ls.fehler && ls.daten && <LeadSharksSteuerung profileId={profileId} kampagnen={ls.daten.kampagnen} formulare={ls.daten.formulare} neuLaden={ls.laden} />}
            {profileId && !ls.fehler && ls.daten && <Button size="sm" variant="outline" onClick={() => setLsOffen(true)}><Plus className="h-3.5 w-3.5 mr-1" />Weitere Kampagne zuweisen</Button>}
          </div>
        )}
      </div>

      {verknuepfenOffen && (
        <VerknuepfenDialog kunde={kunde} wb={wb} konten={um.liste}
          onClose={() => { setVerknuepfenOffen(false); wb.ladeZuo(); kk.laden(); onChanged(); }} />
      )}
      {lsOffen && profileId && ls.daten && (
        <LeadSharksDialog profileId={profileId} ls={ls} wb={wb} kundeId={kunde.id}
          konten={[...(um.liste || []), ...eigeneKonten.map(k => ({ meta_account_id: k.meta_account_id, name: k.meta_account_name }))]}
          onClose={() => { setLsOffen(false); ls.laden(); }} />
      )}

      <AlertDialog open={!!loeseZiel} onOpenChange={o => !o && setLoeseZiel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknüpfung lösen?</AlertDialogTitle>
            <AlertDialogDescription>Werbekonto „{loeseZiel?.name || loeseZiel?.id}“ wird von diesem Kunden getrennt. Daten in Meta bleiben unverändert.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const t = loeseZiel!; setLoeseZiel(null); run(() => loesen('meta', kunde.id, t), 'Verknüpfung gelöst'); }}>Lösen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!loeseZuo} onOpenChange={o => !o && setLoeseZuo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zuordnung lösen?</AlertDialogTitle>
            <AlertDialogDescription>{loeseZuo?.typ === 'konto' ? 'Ganzes Konto' : loeseZuo?.typ === 'kampagne' ? 'Kampagne' : 'Anzeigengruppe'} „{loeseZuo?.objekt_name || loeseZuo?.objekt_id}“ wird diesem Kunden nicht mehr zugerechnet. Ist es die letzte Zuordnung auf {loeseZuo?.untermarke || 'diesem Konto'}, fällt auch die Kontoverknüpfung weg.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const z = loeseZuo!; setLoeseZuo(null); zuoLoesen(z); }}>Lösen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** „Kampagne verknüpfen": eine Suche über alle Kampagnen unserer Untermarken, optional einzelne Anzeigengruppen. */
function VerknuepfenDialog({ kunde, wb, konten, onClose }: {
  kunde: KundeMin; wb: ReturnType<typeof useWerbebudgetZuordnung>; konten: Untermarke[] | null; onClose: () => void;
}) {
  const { callMeta } = useMetaAds();
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kampagne verknüpfen</DialogTitle>
          <DialogDescription>Alle Kampagnen unserer Untermarken. Teilen sich zwei Kunden eine Kampagne, Kampagne aufklappen und einzelne Anzeigengruppen wählen. Konto und Untermarke werden automatisch abgeleitet.</DialogDescription>
        </DialogHeader>
        <KampagnenSuche konten={konten} render={c => (
          <div>
            <p className="px-3 pt-2 text-xs text-muted-foreground">{c.konto.name || c.konto.meta_account_id}</p>
            <KampagneZeile k={c} kontoId={c.konto.meta_account_id} alle={wb.alle} clientId={kunde.id} busy={wb.busy} callMeta={callMeta}
              zuordnen={(t, o, kid, n) => wb.zuordnen(c.konto.meta_account_id, c.konto.name ?? null, t, o, kid, n)} loesen={wb.loesen} />
          </div>
        )} />
        <DialogFooter><Button variant="outline" onClick={onClose}>Fertig</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** LeadSharks: Kampagne aus derselben Suche wählen, dann der bestehende Zuweisen-Assistent. */
function LeadSharksDialog({ profileId, ls, wb, kundeId, konten, onClose }: {
  profileId: string; ls: ReturnType<typeof useLeadSharks>; wb: ReturnType<typeof useWerbebudgetZuordnung>; kundeId: string; konten: Untermarke[]; onClose: () => void;
}) {
  const [wahl, setWahl] = useState<SuchKampagne | null>(null);
  const [zuordnung, setZuordnung] = useState<any[] | null>(null);
  const geteiltMit = (c: SuchKampagne) => {
    const sets = wb.alle.filter(z => z.typ === 'adset' && z.kampagne_id === c.id);
    if (new Set(sets.map(z => z.client_id)).size < 2) return [];
    return [...new Set(sets.filter(z => z.client_id !== kundeId).map(z => z.clients?.name || 'anderer Kunde'))];
  };
  const andere = wahl ? geteiltMit(wahl) : [];
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>LeadSharks-Kampagne zuweisen</DialogTitle>
          <DialogDescription>Meta-Kampagne wählen, danach Formulare und Lead-Typ festlegen.</DialogDescription>
        </DialogHeader>
        {zuordnung && <ZuordnungErgebnis zuordnung={zuordnung} onAusblenden={() => setZuordnung(null)} />}
        {andere.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
            <span>Diese Kampagne ist auf Anzeigengruppen-Ebene mit {andere.join(', ')} geteilt. Beide Kunden brauchen <strong>verschiedene Lead-Formulare</strong>, sonst bekommt nur der zuerst angelegte Kunde Leads – ohne Fehlermeldung.</span>
          </div>
        )}
        <KampagnenSuche konten={konten} render={c => (
          <button onClick={() => setWahl(c)} className={cn('w-full text-left px-3 py-2.5 grid grid-cols-[1fr_150px_100px_80px] gap-3 items-center text-sm hover:bg-muted/50', wahl?.id === c.id && 'bg-primary/10')}>
            <span className="break-words">{c.name}</span>
            <span className="text-xs text-muted-foreground truncate">{c.konto.name || c.konto.meta_account_id}</span>
            <span className="text-xs text-muted-foreground">{STATUS_LABEL[c.effective_status] || c.effective_status}</span>
            <span className="text-right tabular-nums text-xs" title="Ausgaben 7 Tage">{eur(c.insights?.data?.[0]?.spend)}</span>
          </button>
        )} />
        {wahl && (
          <ZuweisenAssistent profileId={profileId} leadTypen={ls.daten?.lead_typen || []}
            vorKonto={{ id: ohneAct(wahl.konto.meta_account_id), name: wahl.konto.name }}
            vorKampagne={{ id: wahl.id, name: wahl.name }}
            onClose={() => setWahl(null)}
            onErfolg={r => { setWahl(null); setZuordnung(Array.isArray(r?.zuordnung) ? r.zuordnung : []); ls.laden(); }} />
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Schließen</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

