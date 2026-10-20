import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ExternalLink, ChevronDown, Pencil, Loader2, X, Info, Search } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LaufzeitAktionen } from '@/components/laufzeiten/LaufzeitAktionen';
import { useActiveCloseCustomers } from '@/hooks/useActiveCloseCustomers';

type Row = {
  client_id: string; kunde: string | null; close_lead_id: string | null; close_status_label: string | null; close_opportunity_id: string | null; quelle: string | null; vc_opportunity_id: string | null;
  startdatum: string | null; laufzeit_monate: number | null; upsell_startdatum: string | null; upsell_laufzeit: number | null; vertragsende: string | null; fehlt: string[];
};
type Log = { id: string; created_at: string; user_email: string | null; kunde: string | null; aktion: string; werte: Record<string, unknown>; fehler: string | null; close_opportunity_id: string | null };
type Form = { startdatum: string; laufzeit_monate: string; abschlusswert: string; retainer_monat: string; leistungen: string[] | null; deal_typ: string; paket: string };
type Opts = { leistungen: string[]; deal_typ: string[]; paket: string[]; cash: Record<string, { activity_id: string; paket: string | null } | null>; opp: Record<string, { leistungen: string | null; deal_typ: string | null }> };
const dt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const empty: Form = { startdatum: '', laufzeit_monate: '', abschlusswert: '', retainer_monat: '', leistungen: null, deal_typ: '', paket: '' };
// Same formula as the server (startdatum + months), only a preview — the saved value always comes back from Close.
function vorschau(f: Form, r: Row) {
  const s = f.startdatum || r.startdatum; const m = f.laufzeit_monate ? Number(f.laufzeit_monate) : r.laufzeit_monate;
  if (!s || !m || !Number.isInteger(m) || m < 1) return null;
  const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10);
}
const plusM = (s: string, m: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); };
function fehltLabels(r: { startdatum: string | null; laufzeit_monate: number | null; close_opportunity_id: string | null; vc_opportunity_id: string | null }) {
  const l: string[] = [];
  if (!r.close_opportunity_id && !r.vc_opportunity_id) l.push('kein Abschluss verknüpft');
  if (!r.startdatum) l.push('Startdatum fehlt');
  if (!r.laufzeit_monate) l.push('Laufzeit fehlt');
  return l;
}
const FEHLT_OPTIONEN = ['Startdatum fehlt', 'Laufzeit fehlt', 'kein Abschluss verknüpft'];
type Vorschlag = { client_id: string; laufzeit_monate: number | null; abschlusswert: number | null; sparte: string | null; deal_typ: string | null; quelle_datum: string | null; quelle_typ: string | null; start_laut_slack: string | null; weitere_upsells: number | null; portal_laufzeit: number | null; abgleich: 'bestaetigt' | 'portal_leer' | 'widerspruch' | null };
const toNum = (v: string) => v.trim() === '' ? null : Number(v.replace(',', '.'));

export default function KundenLaufzeiten() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const { rows, unverknuepft, loading, error: kundenFehler, refetch: loadCustomers } = useActiveCloseCustomers();
  const [logs, setLogs] = useState<Log[]>([]);
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [opts, setOpts] = useState<Opts | null>(null);
  const [optsErr, setOptsErr] = useState<string | null>(null);
  const [vorschlaege, setVorschlaege] = useState<Record<string, Vorschlag>>({});
  const [vorbelegt, setVorbelegt] = useState<Record<string, Set<keyof Form>>>({});
  useEffect(() => {
    (supabase as any).from('laufzeit_vorschlag').select('*').then(({ data, error }: { data: Vorschlag[] | null; error: any }) => {
      if (error) { console.error('laufzeit_vorschlag', error); return; }
      const m: Record<string, Vorschlag> = {}; (data || []).forEach(v => { m[v.client_id] = v; }); setVorschlaege(m);
      const vb: Record<string, Set<keyof Form>> = {}; const fs: Record<string, Partial<Form>> = {};
      Object.values(m).forEach(v => {
        const keys = new Set<keyof Form>(); const f: Partial<Form> = {};
        if (v.abgleich !== 'widerspruch' && v.laufzeit_monate != null) { f.laufzeit_monate = String(v.laufzeit_monate); keys.add('laufzeit_monate'); }
        if (v.abschlusswert != null) { f.abschlusswert = String(v.abschlusswert); keys.add('abschlusswert'); }
        if (v.deal_typ) { f.deal_typ = v.deal_typ; keys.add('deal_typ'); }
        if (keys.size) { vb[v.client_id] = keys; fs[v.client_id] = f; }
      });
      setVorbelegt(vb);
      setForms(p => { const n = { ...p }; Object.entries(fs).forEach(([id, f]) => { if (!p[id]) n[id] = { ...empty, ...f }; }); return n; });
    });
  }, []);
  const [confirm, setConfirm] = useState<Row | null>(null);

  const load = useCallback(async () => {
    await loadCustomers();
    const { data: l } = await supabase.from('close_abschluss_schreiblog').select('id, created_at, user_email, kunde, aktion, werte, fehler, close_opportunity_id').order('created_at', { ascending: false }).limit(20);
    setLogs((l as Log[]) || []);
  }, [loadCustomers]);
  const loadOpts = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('close-abschluss-schreiben', { body: { optionen: true } });
    if (error || data?.error) setOptsErr(data?.error || error?.message || 'Auswahlwerte aus Close nicht geladen'); else { setOpts(data as Opts); setOptsErr(null); }
  }, []);
  useEffect(() => { supabase.from('close_abschluss_schreiblog').select('id, created_at, user_email, kunde, aktion, werte, fehler, close_opportunity_id').order('created_at', { ascending: false }).limit(20).then(({ data }) => setLogs((data as Log[]) || [])); }, []);
  useEffect(() => { if (isAdmin) loadOpts(); }, [isAdmin, loadOpts]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const restTage = (end: string) => Math.ceil((new Date(end + 'T00:00:00').getTime() - today.getTime()) / 86400000);
  // ONE list of active Close customers ("Aktueller Klient" / "Pausiert"); both blocks are a pure partition of it.
  const aktive = rows;
  const vollstaendig = (r: Row) => !!r.startdatum && !!r.laufzeit_monate;
  const klar = useMemo(() => aktive.filter(vollstaendig)
    .map(r => { const vertragsende = r.vertragsende || (r.startdatum ? plusM(r.startdatum, Number(r.laufzeit_monate)) : ''); return { ...r, vertragsende, rest: restTage(vertragsende) }; })
    .sort((a, b) => a.rest - b.rest), [aktive]); // eslint-disable-line react-hooks/exhaustive-deps
  const unklar = useMemo(() => aktive.filter(r => !vollstaendig(r)).sort((a, b) => (a.kunde || '').localeCompare(b.kunde || '')), [aktive]);
  const [suche, setSuche] = useState(''); const [fehltFilter, setFehltFilter] = useState('alle'); const [anzahl, setAnzahl] = useState(12);
  const [weg, setWeg] = useState<Set<string>>(new Set()); const [neu, setNeu] = useState<string | null>(null);
  const unklarGefiltert = unklar.filter(r => (!suche || (r.kunde || '').toLowerCase().includes(suche.toLowerCase())) && (fehltFilter === 'alle' || (fehltFilter === '__slack' ? !!vorschlaege[r.client_id] : fehltFilter === '__widerspruch' ? vorschlaege[r.client_id]?.abgleich === 'widerspruch' : fehltFilter === '__ohne' ? !vorschlaege[r.client_id] : fehltLabels(r).includes(fehltFilter))));

  const form = (id: string) => forms[id] || empty;
  const setF = (id: string, k: keyof Form, v: string | string[]) => { setVorbelegt(p => { if (!p[id]?.has(k)) return p; const s2 = new Set(p[id]); s2.delete(k); return { ...p, [id]: s2 }; }); setForms(p => ({ ...p, [id]: { ...form(id), [k]: v } })); };

  async function save(r: Row, bestaetigt = false, ueber?: Partial<Form>) {
    const f = { ...form(r.client_id), ...(ueber || {}) };
    const body = {
      client_id: r.client_id, close_opportunity_id: r.close_opportunity_id,
      startdatum: f.startdatum || null, laufzeit_monate: toNum(f.laufzeit_monate),
      abschlusswert: toNum(f.abschlusswert), retainer_monat: toNum(f.retainer_monat), anlegen_bestaetigt: bestaetigt,
      leistungen: f.leistungen?.length ? f.leistungen : null,
      deal_typ: f.deal_typ || (!r.close_opportunity_id ? 'Neukunde' : null), paket: f.paket || null,
    };
    if (!body.startdatum && body.laufzeit_monate == null && body.abschlusswert == null && body.retainer_monat == null && !body.leistungen && !f.deal_typ && !body.paket) {
      setErrors(p => ({ ...p, [r.client_id]: 'Bitte mindestens ein Feld ausfüllen.' })); return;
    }
    if (!r.close_opportunity_id && !bestaetigt) { setConfirm(r); return; }
    setSaving(r.client_id); setErrors(p => ({ ...p, [r.client_id]: '' }));
    const { data, error } = await supabase.functions.invoke('close-abschluss-schreiben', { body });
    let msg: string | null = null;
    if (error) { try { msg = (await (error as { context?: Response }).context?.json())?.error; } catch { /* ignore */ } msg = msg || error.message; }
    else if (data?.error) msg = data.error;
    setSaving(null);
    if (msg) { setErrors(p => ({ ...p, [r.client_id]: `Close hat nicht gespeichert: ${msg}` })); await load(); return; }
    toast.success(`${r.kunde}: Abschluss in Close ${data.aktion}, Werte neu aus Close eingelesen.`);
    if (data.paket && !data.paket.gesetzt) toast.warning(data.paket.hinweis);
    loadOpts();
    const warUnklar = !vollstaendig(r);
    if (warUnklar) { setWeg(p => new Set(p).add(r.client_id)); await new Promise(res => setTimeout(res, 350)); }
    setForms(p => { const n = { ...p }; delete n[r.client_id]; return n; }); setEditing(null);
    await load();
    setWeg(p => { const n = new Set(p); n.delete(r.client_id); return n; });
    if (warUnklar) { setNeu(r.client_id); setTimeout(() => setNeu(null), 2500); }
  }

  const fields = (r: Row) => {
    const f = form(r.client_id); const end = vorschau(f, r); const busy = saving === r.client_id;
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] text-muted-foreground">Startdatum<Input type="date" className="h-8 w-36" value={f.startdatum} placeholder={r.startdatum || ''} onChange={e => setF(r.client_id, 'startdatum', e.target.value)} /></label>
          <label className="text-[11px] text-muted-foreground">Laufzeit (Mon.)<Input type="number" min={1} max={120} step={1} className="h-8 w-24" value={f.laufzeit_monate} placeholder={r.laufzeit_monate?.toString() || ''} onChange={e => setF(r.client_id, 'laufzeit_monate', e.target.value)} /></label>
          <label className="text-[11px] text-muted-foreground">Abschlusswert €<Input type="number" min={0} className="h-8 w-28" value={f.abschlusswert} placeholder="optional" onChange={e => setF(r.client_id, 'abschlusswert', e.target.value)} /></label>
          <label className="text-[11px] text-muted-foreground">Retainer/Monat €<Input type="number" min={0} className="h-8 w-28" value={f.retainer_monat} placeholder="optional" onChange={e => setF(r.client_id, 'retainer_monat', e.target.value)} /></label>
          {(() => {
            const cur = r.close_opportunity_id ? opts?.opp[r.close_opportunity_id] : null;
            const curL = cur?.leistungen ? cur.leistungen.split(', ') : [];
            const sel = f.leistungen ?? curL;
            const cash = opts?.cash[r.client_id];
            return <>
              <label className="text-[11px] text-muted-foreground flex flex-col">Leistungen
                <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="h-8 w-44 justify-between font-normal" disabled={!opts}><span className="truncate">{sel.length ? `${sel.length} gewählt` : 'auswählen'}</span><ChevronDown className="h-3 w-3" /></Button></PopoverTrigger>
                  <PopoverContent className="w-80 max-h-72 overflow-y-auto p-2">
                    {(opts?.leistungen || []).map(o => (
                      <label key={o} className="flex items-start gap-2 py-1 text-xs cursor-pointer"><Checkbox checked={sel.includes(o)} onCheckedChange={c => setF(r.client_id, 'leistungen', c ? [...sel, o] : sel.filter(x => x !== o))} />{o}</label>
                    ))}
                  </PopoverContent></Popover></label>
              <label className="text-[11px] text-muted-foreground flex flex-col">Deal-Typ
                <Select value={f.deal_typ || cur?.deal_typ || (!r.close_opportunity_id ? 'Neukunde' : '')} onValueChange={v => setF(r.client_id, 'deal_typ', v)} disabled={!opts}>
                  <SelectTrigger className="h-8 w-36"><SelectValue placeholder="–" /></SelectTrigger>
                  <SelectContent>{(opts?.deal_typ || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></label>
              <label className="text-[11px] text-muted-foreground flex flex-col">Paket
                <Select value={f.paket || cash?.paket || ''} onValueChange={v => setF(r.client_id, 'paket', v)} disabled={!cash}>
                  <SelectTrigger className="h-8 w-28"><SelectValue placeholder="–" /></SelectTrigger>
                  <SelectContent>{(opts?.paket || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></label>
            </>;
          })()}
          <Button size="sm" className="h-8" disabled={busy} onClick={() => save(r)}>{busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Speichern</Button>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">Vertragsende: {end ? dt(end) : 'Startdatum und Laufzeit nötig'}{!r.close_opportunity_id && (r.vc_opportunity_id ? ' · Abschluss existiert nur bei Viral Connect – legt ihn in unserem Close an (Marke „Viral Connect“)' : ' · legt in Close einen gewonnenen Abschluss an')}</p>
        {opts && !opts.cash[r.client_id] && <p className="text-xs text-muted-foreground">Für {r.kunde} existiert keine Cash-Collect-Aktivität — Paket kann nicht gesetzt werden. {r.close_lead_id && <a href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer" className="text-primary">In Close öffnen</a>}</p>}
        {optsErr && <p className="text-xs text-destructive">Auswahlwerte aus Close nicht geladen: {optsErr}</p>}
        {errors[r.client_id] && <p className="text-xs text-destructive">{errors[r.client_id]}</p>}
      </div>
    );
  };
  const feld = 'h-10 rounded-xl border-0 bg-muted/60 shadow-none focus-visible:ring-1 focus-visible:ring-primary/40 focus-visible:ring-offset-0';
  const tip = (t: string) => <Tooltip><TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent className="max-w-xs">{t}</TooltipContent></Tooltip>;
  const karte = (r: Row) => {
    const f = form(r.client_id); const busy = saving === r.client_id;
    const s0 = f.startdatum || r.startdatum || ''; const m0 = f.laufzeit_monate || (r.laufzeit_monate ? String(r.laufzeit_monate) : '');
    const mN = Number(m0); const bereit = !!s0 && Number.isInteger(mN) && mN >= 1;
    const end = bereit ? plusM(s0, mN) : null;
    const cur = r.close_opportunity_id ? opts?.opp[r.close_opportunity_id] : null;
    const curL = cur?.leistungen ? cur.leistungen.split(', ') : []; const sel = f.leistungen ?? curL; const cash = opts?.cash[r.client_id];
    const lbl = 'text-[11px] text-muted-foreground flex items-center gap-1 mb-1';
    const v = vorschlaege[r.client_id]; const vb = vorbelegt[r.client_id];
    const vf = (k: keyof Form) => vb?.has(k) ? 'ring-1 ring-primary/40 bg-primary/5 italic' : '';
    const vTag = (k: keyof Form) => vb?.has(k) ? <span className="text-[10px] text-primary/80">· Vorschlag</span> : null;
    return (
      <div key={r.client_id} className={cn('rounded-2xl bg-card p-6 shadow-[0_1px_3px_hsl(var(--foreground)/0.06),0_8px_24px_-12px_hsl(var(--foreground)/0.10)] flex flex-col gap-4 transition-all duration-300', weg.has(r.client_id) && 'opacity-0 scale-95 -translate-y-2')}>
        <div>
          <h3 className="text-base font-semibold leading-tight">{r.kunde}</h3>
          <div className="flex flex-wrap gap-1.5 mt-2">{fehltLabels(r).map(l => <span key={l} className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{l}</span>)}
            {r.quelle === 'Viral Connect' && <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">aus Viral Connect</span>}
            {v?.abgleich === 'bestaetigt' && <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">aus Slack bestätigt</span>}</div>
        </div>
        {isAdmin ? <>
          {v ? <p className="text-xs text-muted-foreground">Vorschlag aus Slack vom {dt(v.quelle_datum)} · Quelle: {v.quelle_typ === 'upsell' ? 'Upsell' : 'Abschluss'}</p>
            : <p className="text-xs text-muted-foreground">kein Slack-Vorschlag vorhanden</p>}
          {v?.abgleich === 'widerspruch' && <div className="rounded-xl bg-muted/60 px-4 py-3 text-xs space-y-2">
            <p>Portal: {v.portal_laufzeit ?? '–'} Mon. · Slack: {v.laufzeit_monate ?? '–'} Mon.{(v.weitere_upsells ?? 0) > 0 && ` · ${v.weitere_upsells} Upsell(s) vorhanden`}</p>
            <div className="flex gap-2">
              {v.portal_laufzeit != null && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setF(r.client_id, 'laufzeit_monate', String(v.portal_laufzeit))}>Portal übernehmen</Button>}
              {v.laufzeit_monate != null && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setF(r.client_id, 'laufzeit_monate', String(v.laufzeit_monate))}>Slack übernehmen</Button>}
            </div></div>}
          <div className="space-y-3">
            <div><span className={lbl}>Startdatum{!r.close_opportunity_id && tip(r.vc_opportunity_id ? 'Abschluss existiert nur bei Viral Connect – beim Speichern wird er in unserem Close angelegt (Marke „Viral Connect“).' : 'Beim Speichern wird in Close ein gewonnener Abschluss angelegt (mit Bestätigung).')}</span>
              <Input type="date" className={feld} value={s0} onChange={e => setF(r.client_id, 'startdatum', e.target.value)} />
              {v?.start_laut_slack && <p className="text-[11px] text-muted-foreground mt-1">laut Slack {dt(v.start_laut_slack)}</p>}</div>
            <div><span className={lbl}>Laufzeit (Mon.){vTag('laufzeit_monate')}</span>
              <Input type="number" min={1} max={120} step={1} className={cn(feld, vf('laufzeit_monate'))} value={m0} onChange={e => setF(r.client_id, 'laufzeit_monate', e.target.value)} /></div>
          </div>
          {end && <div className="rounded-xl bg-primary/5 px-4 py-3 text-sm tabular-nums"><span className="text-muted-foreground">Vertragsende:</span> <span className="font-semibold text-primary">{dt(end)}</span> <span className="text-muted-foreground">· Restlaufzeit {restTage(end)} Tage</span></div>}
          <Collapsible>
            <CollapsibleTrigger className="group text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">Weitere Angaben <ChevronDown className="h-3 w-3 transition-transform group-data-[state=open]:rotate-180" /></CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div><span className={lbl}>Abschlusswert €{vTag('abschlusswert')}</span><Input type="number" min={0} className={cn(feld, vf('abschlusswert'))} value={f.abschlusswert} placeholder="optional" onChange={e => setF(r.client_id, 'abschlusswert', e.target.value)} /></div>
              <div><span className={lbl}>Retainer/Monat €</span><Input type="number" min={0} className={feld} value={f.retainer_monat} placeholder="optional" onChange={e => setF(r.client_id, 'retainer_monat', e.target.value)} /></div>
              <div><span className={lbl}>Leistungen{optsErr && tip(`Auswahlwerte aus Close nicht geladen: ${optsErr}`)}</span>
                <Popover><PopoverTrigger asChild><Button variant="ghost" className={cn(feld, 'w-full justify-between font-normal')} disabled={!opts}><span className="truncate">{sel.length ? `${sel.length} gewählt` : 'auswählen'}</span><ChevronDown className="h-3 w-3" /></Button></PopoverTrigger>
                  <PopoverContent className="w-80 max-h-72 overflow-y-auto p-2">{(opts?.leistungen || []).map(o => <label key={o} className="flex items-start gap-2 py-1 text-xs cursor-pointer"><Checkbox checked={sel.includes(o)} onCheckedChange={c => setF(r.client_id, 'leistungen', c ? [...sel, o] : sel.filter(x => x !== o))} />{o}</label>)}</PopoverContent></Popover></div>
              <div><span className={lbl}>Deal-Typ{vTag('deal_typ')}</span>
                <Select value={f.deal_typ || cur?.deal_typ || (!r.close_opportunity_id ? 'Neukunde' : '')} onValueChange={x => setF(r.client_id, 'deal_typ', x)} disabled={!opts}>
                  <SelectTrigger className={cn(feld, vf('deal_typ'))}><SelectValue placeholder="–" /></SelectTrigger><SelectContent>{(opts?.deal_typ || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
              <div><span className={lbl}>Paket{opts && !cash && tip(`Für ${r.kunde} existiert keine Cash-Collect-Aktivität — Paket kann nicht gesetzt werden.`)}</span>
                <Select value={f.paket || cash?.paket || ''} onValueChange={v => setF(r.client_id, 'paket', v)} disabled={!cash}>
                  <SelectTrigger className={feld}><SelectValue placeholder="–" /></SelectTrigger><SelectContent>{(opts?.paket || []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select></div>
            </CollapsibleContent>
          </Collapsible>
          {errors[r.client_id] && <p className="text-xs text-destructive">{errors[r.client_id]}</p>}
        </> : <p className="text-xs text-muted-foreground">Nachtragen können Admins.</p>}
        <div className="mt-auto flex items-center justify-between pt-1">
          {r.close_lead_id ? <a href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1">In Close öffnen <ExternalLink className="h-3 w-3" /></a> : <span />}
          {isAdmin && <Button size="sm" className="rounded-xl" disabled={busy || !bereit} onClick={() => { if (!f.startdatum && s0) setF(r.client_id, 'startdatum', s0); save({ ...r }, false, { startdatum: s0, laufzeit_monate: m0 }); }}>{busy && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Speichern</Button>}
        </div>
      </div>
    );
  };
  const closeLink = (r: Row) => r.close_lead_id && <a href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">Close <ExternalLink className="h-3 w-3" /></a>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Laufzeiten</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Aktive Kunden laut Close („Aktueller Klient“, „Pausiert“). Eingaben werden direkt in Close gespeichert und danach neu aus Close eingelesen.</p>
        {!loading && <p className="text-sm text-muted-foreground mt-2 tabular-nums"><span className="text-foreground font-medium">{aktive.length} aktive Kunden</span> · {klar.length} mit vollständiger Laufzeit · {unklar.length} unvollständig</p>}
      </div>
      {kundenFehler && <p role="alert" className="text-sm text-destructive">{kundenFehler}</p>}
      {!kundenFehler && unverknuepft.length > 0 && <p className="text-sm text-muted-foreground rounded-xl border border-border/60 px-4 py-2">Nicht angezeigt, weil kein Kunde zugeordnet ist: {unverknuepft.join(', ')}. Bitte unter „Verknüpfungen“ zuordnen.</p>}
      {loading ? <Skeleton className="h-40" /> : !kundenFehler && <>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Aktive Kunden mit Laufzeit ({klar.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Kunde</TableHead><TableHead>Start</TableHead><TableHead>Laufzeit</TableHead><TableHead>Vertragsende</TableHead><TableHead className="text-right">Restlaufzeit</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {klar.map(r => editing === r.client_id ? (
                  <TableRow key={r.client_id}><TableCell className="font-medium align-top pt-4">{r.kunde}</TableCell><TableCell colSpan={4}>{fields(r)}</TableCell>
                    <TableCell className="align-top"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button></TableCell></TableRow>
                ) : (
                  <TableRow key={r.client_id} className={cn('transition-colors duration-700', neu === r.client_id && 'bg-primary/5 animate-in fade-in slide-in-from-bottom-2 duration-500')}>
                    <TableCell className="font-medium">{r.kunde}{r.quelle === 'Viral Connect' && <Badge variant="outline" className="ml-2 text-[10px]">aus Viral Connect</Badge>}</TableCell>
                    <TableCell className="tabular-nums">{dt(r.startdatum)}</TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">{r.upsell_startdatum && r.upsell_laufzeit ? <>{r.upsell_laufzeit} Mon.<Tooltip><TooltipTrigger asChild><Badge variant="outline" className="ml-2 text-[10px] font-normal text-muted-foreground cursor-default">verlängert</Badge></TooltipTrigger><TooltipContent>1. Laufzeit: {dt(r.startdatum)}, {r.laufzeit_monate} Mon. · Verlängerung ab {dt(r.upsell_startdatum)}</TooltipContent></Tooltip></> : <>{r.laufzeit_monate} Mon.</>}</TableCell>
                    <TableCell className="tabular-nums">{dt(r.vertragsende)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.rest} Tage {r.rest < 30 && <Badge variant="destructive" className="ml-2">unter 30 Tage</Badge>}</TableCell>
                    <TableCell className="text-right whitespace-nowrap space-x-1">{isAdmin && <LaufzeitAktionen r={r} onDone={load} />}{isAdmin && <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(r.client_id)}><Pencil className="h-3 w-3 mr-1" />Bearbeiten</Button>}{closeLink(r)}</TableCell>
                  </TableRow>
                ))}
                {!klar.length && <TableRow><TableCell colSpan={6} className="text-sm text-muted-foreground">Noch kein aktiver Kunde mit vollständiger Laufzeit.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Laufzeit unklar ({unklar.length})</h2>
            <p className="text-xs text-muted-foreground">Hier wird nichts geschätzt. {isAdmin ? 'Startdatum und Laufzeit eintragen und speichern – geschrieben wird nach Close.' : 'Nachtragen können Admins.'}</p>
          </div>
          {unklar.length > 0 && <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative sm:w-72"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 pl-9 rounded-xl border-0 bg-muted/60 shadow-none" placeholder="Kunde suchen" value={suche} onChange={e => { setSuche(e.target.value); setAnzahl(12); }} /></div>
            <Select value={fehltFilter} onValueChange={v => { setFehltFilter(v); setAnzahl(12); }}>
              <SelectTrigger className="h-9 sm:w-56 rounded-xl border-0 bg-muted/60 shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="alle">Alles, was fehlt</SelectItem>{FEHLT_OPTIONEN.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}<SelectItem value="__slack">nur mit Slack-Vorschlag</SelectItem><SelectItem value="__widerspruch">nur Widersprüche</SelectItem><SelectItem value="__ohne">ohne Vorschlag</SelectItem></SelectContent>
            </Select>
          </div>}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {unklarGefiltert.slice(0, anzahl).map(r => karte(r))}
          </div>
          {!unklarGefiltert.length && <p className="text-sm text-muted-foreground">{unklar.length ? 'Kein Kunde passt zu Suche oder Filter.' : 'Alle aktiven Kunden haben eine vollständige Laufzeit.'}</p>}
          {unklarGefiltert.length > anzahl && <div className="flex justify-center"><Button variant="ghost" className="text-muted-foreground" onClick={() => setAnzahl(a => a + 12)}>Weitere anzeigen ({unklarGefiltert.length - anzahl})</Button></div>}
        </section>
        {isAdmin && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Schreibprotokoll Close (letzte 20)</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Zeitpunkt</TableHead><TableHead>Wer</TableHead><TableHead>Kunde</TableHead><TableHead>Aktion</TableHead><TableHead>Werte</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map(l => (
                  <TableRow key={l.id}>
                    <TableCell className="tabular-nums text-xs">{new Date(l.created_at).toLocaleString('de-DE')}</TableCell>
                    <TableCell className="text-xs">{l.user_email}</TableCell>
                    <TableCell className="text-xs">{l.kunde}</TableCell>
                    <TableCell><Badge variant={l.aktion === 'fehlgeschlagen' ? 'destructive' : 'outline'}>{l.aktion}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{Object.entries(l.werte || {}).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}{l.fehler && <span className="block text-destructive">{l.fehler}</span>}</TableCell>
                  </TableRow>
                ))}
                {!logs.length && <TableRow><TableCell colSpan={5} className="text-sm text-muted-foreground">Noch keine Schreibaktion.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>}
      </>}
      <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abschluss in Close anlegen?</AlertDialogTitle>
            <AlertDialogDescription>Für {confirm?.kunde} wird in Close ein gewonnener Abschluss angelegt (Pipeline „Sales“, Status „Won“, Deal-Typ „{(confirm && forms[confirm.client_id]?.deal_typ) || 'Neukunde'}“) mit den eingegebenen Werten.{confirm?.vc_opportunity_id && ' Der Abschluss existiert bisher nur in Noahs Close; dort wird nichts geändert. Am Lead wird die Marke „Viral Connect“ gesetzt, falls sie leer ist.'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const r = confirm!; setConfirm(null); save(r, true, { startdatum: forms[r.client_id]?.startdatum || r.startdatum || '', laufzeit_monate: forms[r.client_id]?.laufzeit_monate || (r.laufzeit_monate ? String(r.laufzeit_monate) : '') }); }}>Anlegen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
