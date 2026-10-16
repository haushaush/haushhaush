// Karte „Meta" im Verknüpfungen-Tab: bündelt Werbekonto, Werbebudget-Zuordnung und LeadSharks in einem Stufendialog.
// Verwendet ausschließlich vorhandene Logik (kundenVerknuepfungen, werbebudgetZuordnung, LeadSharksMeta).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type SystemKey, type SystemStand, type KundeMin, type Objekt, verknuepfen, verwerfen, portalMeta } from '@/lib/kundenVerknuepfungen';
import { ladeUntermarken, STATUS_LABEL, type Untermarke } from '@/lib/werbebudgetKonten';
import { KampagneZeile, useWerbebudgetZuordnung, type ZuoKampagne } from './werbebudgetZuordnung';
import { Kachel, ZuweisenAssistent, ZuordnungErgebnis, fehlerMeldung, type LeadTyp } from './LeadSharksMeta';
import { PortalAuswahl } from './VerknuepfungenTab';

type Weg = 'untermarke' | 'kundenkonto';
type SnapKampagne = { campaign_id: string; campaign_name: string | null; status: string | null; daily_budget: any };
const ohneAct = (id: string) => id.replace(/^act_/, '');
const eur = (v: any) => v == null ? '—' : `€${Number(v).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`;

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

export function MetaKarte({ kunde, stand, onChanged }: { kunde: KundeMin; stand: Record<SystemKey, SystemStand>; onChanged: () => void }) {
  const wb = useWerbebudgetZuordnung(kunde.id);
  const profileId = stand.portal?.zustand === 'verknuepft' ? stand.portal.objekt.id : null;
  const ls = useLeadSharks(profileId);
  const [offen, setOffen] = useState(false);

  const meta = stand.meta;
  const eigene = wb.alle.filter(z => z.client_id === kunde.id);
  const nK = eigene.filter(z => z.typ === 'kampagne').length, nA = eigene.filter(z => z.typ === 'adset').length;
  const marken = [...new Set(eigene.map(z => z.untermarke || z.meta_account_id))];

  const zeilen: { label: string; ok: boolean; status: string; text: string }[] = [
    {
      label: 'Werbekonto', ok: meta?.zustand === 'verknuepft',
      status: meta?.zustand === 'verknuepft' ? 'Verknüpft' : meta?.zustand === 'vorschlag' ? 'Vorschlag' : 'Nicht verknüpft',
      text: meta?.zustand === 'verknuepft' ? (meta.objekt.name || meta.objekt.id) : meta?.zustand === 'vorschlag' ? `${meta.vorschlag.name || meta.vorschlag.id} · ${meta.vorschlag.grund}` : 'Kein Kundenkonto zugeordnet',
    },
    {
      label: 'Werbebudget', ok: eigene.length > 0, status: eigene.length ? 'Zugeordnet' : 'Nicht zugeordnet',
      text: eigene.length ? `${nK} ${nK === 1 ? 'Kampagne' : 'Kampagnen'}, ${nA} ${nA === 1 ? 'Anzeigengruppe' : 'Anzeigengruppen'} · ${marken.join(', ')}` : 'Keine Kampagne auf einer Untermarke zugeordnet',
    },
    {
      label: 'LeadSharks', ok: !!profileId && !!ls.daten?.kampagnen.length,
      status: !profileId ? 'Portalkonto fehlt' : ls.fehler ? 'Fehler' : ls.daten ? (ls.daten.kampagnen.length ? 'Eingerichtet' : 'Nicht eingerichtet') : 'Lädt …',
      text: !profileId ? 'Portalkonto fehlt' : ls.fehler ? ls.fehler : ls.daten ? `${ls.daten.kampagnen.length} Kampagnen, ${ls.daten.formulare.length} Formulare` : '…',
    },
  ];

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Meta</p>
          <p className="text-[11px] text-muted-foreground">Werbekonto, Werbebudget und LeadSharks</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOffen(true)}>Einrichten</Button>
      </div>
      <div className="space-y-1.5">
        {zeilen.map(z => (
          <div key={z.label} className="grid grid-cols-1 sm:grid-cols-[140px_130px_1fr] gap-1 sm:gap-4 sm:items-center text-sm">
            <span className="text-xs text-muted-foreground">{z.label}</span>
            <span className={cn('text-xs font-medium flex items-center gap-1.5', z.ok ? 'text-success' : 'text-muted-foreground')}><span className="h-1.5 w-1.5 rounded-full bg-current" />{z.status}</span>
            <span className="text-xs truncate">{z.text}</span>
          </div>
        ))}
      </div>
      {offen && <MetaDialog kunde={kunde} stand={stand} wb={wb} profileId={profileId} ls={ls}
        onChanged={onChanged} onClose={() => { setOffen(false); wb.ladeZuo(); ls.laden(); }} />}
    </div>
  );
}

function MetaDialog({ kunde, stand, wb, profileId, ls, onChanged, onClose }: {
  kunde: KundeMin; stand: Record<SystemKey, SystemStand>; wb: ReturnType<typeof useWerbebudgetZuordnung>;
  profileId: string | null; ls: ReturnType<typeof useLeadSharks>; onChanged: () => void; onClose: () => void;
}) {
  const { callMeta } = useMetaAds();
  const meta = stand.meta;
  const verknuepftId = meta?.zustand === 'verknuepft' ? meta.objekt.id : null;
  const hatZuo = wb.alle.some(z => z.client_id === kunde.id);
  const [weg, setWeg] = useState<Weg>(hatZuo ? 'untermarke' : verknuepftId ? 'kundenkonto' : 'untermarke');
  const stufen = weg === 'untermarke' ? [1, 2, 3, 4, 5] : [1, 2, 3, 5];
  const [idx, setIdx] = useState(0);
  const stufe = stufen[idx];

  const [konten, setKonten] = useState<Untermarke[] | null>(null);
  const [q, setQ] = useState('');
  const [konto, setKonto] = useState<Untermarke | null>(null);
  const [belegt, setBelegt] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [kampagnen, setKampagnen] = useState<SnapKampagne[] | null>(null);
  const [kampagne, setKampagne] = useState<SnapKampagne | null>(null);
  const [budget, setBudget] = useState<any[] | null>(null);
  const [assistent, setAssistent] = useState(false);
  const [zuordnung, setZuordnung] = useState<any[] | null>(null);

  useEffect(() => { ladeUntermarken().then(setKonten); }, []);

  // Belegte Kundenkonten (kunde_meta_accounts) für „gehört zu <Kunde>".
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('kunde_meta_accounts').select('meta_account_id, client_id');
      const fremd = (data || []).filter((r: any) => r.client_id !== kunde.id);
      const ids = [...new Set(fremd.map((r: any) => r.client_id))];
      const { data: cl } = ids.length ? await supabase.from('clients').select('id, name').in('id', ids) : { data: [] as any[] };
      const n = new Map((cl || []).map((c: any) => [c.id, c.name]));
      setBelegt(Object.fromEntries(fremd.map((r: any) => [r.meta_account_id, n.get(r.client_id) || 'anderem Kunden'])));
    })();
  }, [kunde.id, verknuepftId]);

  useEffect(() => {
    if (!konto) { setKampagnen(null); return; }
    setKampagnen(null);
    (supabase.from as any)('meta_campaign_snapshot').select('campaign_id, campaign_name, status, daily_budget').eq('account_id', konto.meta_account_id).order('campaign_name')
      .then(({ data }: any) => setKampagnen(data || []));
  }, [konto]);

  useEffect(() => {
    if (stufe !== 4) return;
    (supabase.from as any)('werbebudget_eingezahlt').select('quelle, eingezahlt_netto, offen_netto, rechnungen_offen, aelteste_ueberfaellig, letzte_zahlung').eq('client_id', kunde.id)
      .then(({ data }: any) => setBudget(data || []));
  }, [stufe, kunde.id]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e: any) { toast.error(e.message || 'Fehlgeschlagen'); }
    finally { setBusy(false); }
  };

  const gefiltert = (konten || []).filter(k => !q.trim() || `${k.name || ''} ${k.meta_account_id}`.toLowerCase().includes(q.trim().toLowerCase()));
  const kontoVerknuepft = weg === 'untermarke' || (!!konto && konto.meta_account_id === verknuepftId);
  const kannWeiter = stufe === 1 || (stufe === 2 && !!konto && kontoVerknuepft) || (stufe === 3 && !!kampagne) || stufe === 4;

  const zuoKampagne: ZuoKampagne | null = kampagne ? { id: kampagne.campaign_id, name: kampagne.campaign_name || kampagne.campaign_id, effective_status: kampagne.status || '', daily_budget: kampagne.daily_budget != null ? String(kampagne.daily_budget) : undefined } : null;
  const zuordnen = (typ: 'kampagne' | 'adset', objekt_id: string, kampagne_id: string, objekt_name: string) =>
    wb.zuordnen(konto!.meta_account_id, konto!.name ?? null, typ, objekt_id, kampagne_id, objekt_name);

  const andereKunden = useMemo(() => {
    if (!kampagne) return [] as string[];
    const sets = wb.alle.filter(z => z.typ === 'adset' && z.kampagne_id === kampagne.campaign_id);
    if (new Set(sets.map(z => z.client_id)).size < 2) return [];
    return [...new Set(sets.filter(z => z.client_id !== kunde.id).map(z => z.clients?.name || 'anderer Kunde'))];
  }, [wb.alle, kampagne, kunde.id]);

  const titel = { 1: 'Weg wählen', 2: 'Werbekonto', 3: 'Kampagne', 4: 'Werbebudget', 5: 'LeadSharks' }[stufe as 1];

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Meta einrichten</DialogTitle>
          <DialogDescription>Stufe {idx + 1} von {stufen.length} · {titel}</DialogDescription>
        </DialogHeader>

        {stufe === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Kachel aktiv={weg === 'untermarke'} onClick={() => { setWeg('untermarke'); }} titel="Über Untermarke" unter="Kampagnen auf unseren Werbekonten, Budget wird diesem Kunden zugeordnet" />
            <Kachel aktiv={weg === 'kundenkonto'} onClick={() => { setWeg('kundenkonto'); }} titel="Über Kundenkonto" unter="Eigenes Werbekonto des Kunden" />
          </div>
        )}

        {stufe === 2 && (
          <div className="space-y-3">
            {weg === 'kundenkonto' && meta?.zustand === 'vorschlag' && (
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm flex flex-wrap items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">Vorschlag: {meta.vorschlag.name || meta.vorschlag.id}</p>
                  <p className="text-xs text-muted-foreground">{meta.vorschlag.grund}</p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => run(() => verknuepfen('meta', kunde.id, meta.vorschlag), 'Meta Ads verknüpft')}><Check className="h-3.5 w-3.5 mr-1" />Übernehmen</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => verwerfen(meta.vorschlag, kunde.id), 'Vorschlag verworfen')}>Verwerfen</Button>
              </div>
            )}
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Werbekonto suchen…" className="h-9 bg-muted/50 border-0" />
            {!konten && <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[76px] rounded-xl" />)}</div>}
            {konten && gefiltert.length === 0 && <p className="text-sm text-muted-foreground">Keine Werbekonten gefunden.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {gefiltert.map(k => {
                const fremd = weg === 'kundenkonto' ? belegt[k.meta_account_id] : undefined;
                if (fremd) return (
                  <div key={k.meta_account_id} className="rounded-xl border border-border p-4 min-h-[76px] opacity-50">
                    <p className="text-sm font-medium break-words">{k.name || k.meta_account_id}</p>
                    <p className="text-xs text-muted-foreground mt-1">gehört zu {fremd}</p>
                  </div>
                );
                const eigen = weg === 'kundenkonto' && k.meta_account_id === verknuepftId;
                return <Kachel key={k.meta_account_id} aktiv={konto?.meta_account_id === k.meta_account_id}
                  onClick={() => { setKonto(k); setKampagne(null); }} titel={k.name || k.meta_account_id}
                  unter={eigen ? `${k.meta_account_id} · mit diesem Kunden verknüpft` : k.meta_account_id} />;
              })}
            </div>
            {weg === 'kundenkonto' && konto && !kontoVerknuepft && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs flex-1">„{konto.name || konto.meta_account_id}“ ist noch nicht mit diesem Kunden verknüpft.{verknuepftId ? ' Ein anderes Konto ist bereits verknüpft.' : ''}</p>
                <Button size="sm" disabled={busy} onClick={() => run(() => verknuepfen('meta', kunde.id, { id: konto.meta_account_id, name: konto.name } as Objekt), 'Meta Ads verknüpft')}>
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}Konto mit Kunden verknüpfen
                </Button>
              </div>
            )}
          </div>
        )}

        {stufe === 3 && (
          <div className="space-y-3">
            {!kampagnen && <div className="grid gap-3 sm:grid-cols-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-[76px] rounded-xl" />)}</div>}
            {kampagnen?.length === 0 && <p className="text-sm text-muted-foreground">Keine Kampagnen zu diesem Konto gespiegelt.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {kampagnen?.map(c => <Kachel key={c.campaign_id} aktiv={kampagne?.campaign_id === c.campaign_id} onClick={() => setKampagne(c)}
                titel={c.campaign_name || c.campaign_id} unter={c.status ? (STATUS_LABEL[c.status] || c.status) : ''} />)}
            </div>
          </div>
        )}

        {stufe === 4 && zuoKampagne && (
          <div className="space-y-4">
            <div className="divide-y divide-border/40 rounded-xl bg-muted/20">
              <KampagneZeile k={zuoKampagne} alle={wb.alle} clientId={kunde.id} busy={wb.busy} callMeta={callMeta} zuordnen={zuordnen} loesen={wb.loesen} />
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Budgetstand dieses Kunden</p>
              {!budget && <Skeleton className="h-16 rounded-xl" />}
              {budget?.length === 0 && <p className="text-xs text-muted-foreground">Kein Budgetstand vorhanden.</p>}
              {budget?.map((b, i) => {
                const warn = Number(b.rechnungen_offen || 0) > 0 || !!b.aelteste_ueberfaellig;
                return (
                  <div key={i} className={cn('rounded-xl border p-3 text-sm space-y-2', warn ? 'border-warning/40 bg-warning/10' : 'border-border')}>
                    {warn && <p className="flex items-start gap-1.5 text-sm font-medium"><AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                      {Number(b.rechnungen_offen || 0)} offene Rechnung(en){b.aelteste_ueberfaellig ? ` · überfällig seit ${new Date(b.aelteste_ueberfaellig).toLocaleDateString('de-DE')}` : ''}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 tabular-nums">
                      <div><p className="text-[11px] text-muted-foreground">Eingezahlt (netto)</p><p>{eur(b.eingezahlt_netto)}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Offen (netto)</p><p>{eur(b.offen_netto)}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Offene Rechnungen</p><p>{b.rechnungen_offen ?? '—'}</p></div>
                      <div><p className="text-[11px] text-muted-foreground">Letzte Zahlung</p><p>{b.letzte_zahlung ? new Date(b.letzte_zahlung).toLocaleDateString('de-DE') : '—'}</p></div>
                    </div>
                    {b.quelle && <p className="text-[11px] text-muted-foreground">Quelle: {b.quelle}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {stufe === 5 && konto && kampagne && (
          <div className="space-y-4">
            {andereKunden.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                <span>Diese Kampagne ist auf Anzeigengruppen-Ebene mit {andereKunden.join(', ')} geteilt. Budget trennt auf Anzeigengruppen-Ebene, Leads trennen auf Formular-Ebene: Beide Kunden brauchen <strong>verschiedene Lead-Formulare</strong>, sonst bekommt nur der zuerst angelegte Kunde Leads – ohne Fehlermeldung.</span>
              </div>
            )}
            {!profileId ? (
              <div className="space-y-2">
                <p className="text-sm">Für LeadSharks fehlt noch das Portalkonto dieses Kunden.</p>
                <div className="[&>div]:sm:ml-0 [&>div]:mt-0">
                  <PortalAuswahl kunde={kunde} onPick={o => run(() => verknuepfen('portal', kunde.id, o), 'LeadSharks Portal verknüpft')} />
                </div>
              </div>
            ) : (
              <>
                {ls.fehler && <p className="text-sm text-destructive">{ls.fehler}</p>}
                {!ls.daten && !ls.fehler && <Skeleton className="h-16 rounded-xl" />}
                {ls.daten && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-border p-4"><p className="text-sm font-medium break-words">{konto.name || konto.meta_account_id}</p><p className="text-xs text-muted-foreground mt-1">Werbekonto</p></div>
                      <div className="rounded-xl border border-border p-4"><p className="text-sm font-medium break-words">{kampagne.campaign_name || kampagne.campaign_id}</p><p className="text-xs text-muted-foreground mt-1">Kampagne</p></div>
                    </div>
                    <Button onClick={() => setAssistent(true)}>LeadSharks-Kampagne anlegen</Button>
                  </div>
                )}
                {zuordnung && <ZuordnungErgebnis zuordnung={zuordnung} onAusblenden={() => setZuordnung(null)} />}
                {assistent && ls.daten && (
                  <ZuweisenAssistent profileId={profileId} leadTypen={ls.daten.lead_typen}
                    vorKonto={{ id: ohneAct(konto.meta_account_id), name: konto.name }}
                    vorKampagne={{ id: kampagne.campaign_id, name: kampagne.campaign_name }}
                    onClose={() => setAssistent(false)}
                    onErfolg={r => { setAssistent(false); setZuordnung(Array.isArray(r?.zuordnung) ? r.zuordnung : []); ls.laden(); }} />
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {idx > 0 && <Button variant="outline" onClick={() => setIdx(i => i - 1)}>Zurück</Button>}
          {idx < stufen.length - 1
            ? <Button disabled={!kannWeiter || busy} onClick={() => setIdx(i => i + 1)}>Weiter</Button>
            : <Button variant="outline" onClick={onClose}>Schließen</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
