import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Loader2, Check, UserX, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { companySimilarity } from '../../../supabase/functions/_shared/survey-matching';

interface Answer {
 id: string; client_id: string | null; eingegeben_firma: string | null; eingegeben_email: string | null; zuordnung_status: string; created_at: string; updated_at: string; score_betreuung: number | null; score_leistung: number | null; freitext: string | null;
 b1_reaktionszeit: number | null; b2_umgang: number | null; b3_verbindlichkeit: number | null; b4_eigeninitiative: number | null; l1_anfragemenge: number | null; l2_anfragequalitaet: number | null; l3_weiterempfehlung: number | null;
}
interface Candidate { client_id: string; mitarbeiter_id: string; clients: { name: string } | null }
interface TokenRow { token: string; client_name: string; versendet_am: string | null; ausgefuellt_am: string | null }
const sharedLink = 'https://leadsharks.de/zufriedenheit';
const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; };
const months = () => { const out: string[] = []; const d = new Date(2026, 8, 1); for (let i = 0; i < 18; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); d.setMonth(d.getMonth() + 1); } return out; };
const fmt = (s: string | null) => s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–';
const QUESTIONS = [ ['b1_reaktionszeit', 'Reaktionszeit'], ['b2_umgang', 'Umgang'], ['b3_verbindlichkeit', 'Verbindlichkeit'], ['b4_eigeninitiative', 'Eigeninitiative'], ['l1_anfragemenge', 'Anfragemenge'], ['l2_anfragequalitaet', 'Anfragequalität'], ['l3_weiterempfehlung', 'Weiterempfehlung'] ] as const;

function Answers({ answer }: { answer: Answer }) {
 return <details className="text-sm mt-2"><summary className="cursor-pointer text-muted-foreground">Antworten · Betreuung {answer.score_betreuung ?? '–'} · Leistung {answer.score_leistung ?? '–'}</summary><dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 mt-3">{QUESTIONS.map(([key, label]) => <div key={key} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{answer[key]} / 5</dd></div>)}</dl>{answer.freitext && <p className="whitespace-pre-wrap break-words mt-3">{answer.freitext}</p>}</details>;
}

export default function BonusFunnel() {
 const [monat, setMonat] = useState(monthNow);
 const [mitarbeiter, setMitarbeiter] = useState<{ id: string; name: string }[]>([]);
 const [maId, setMaId] = useState('');
 const [rows, setRows] = useState<TokenRow[]>([]);
 const [answers, setAnswers] = useState<Answer[]>([]);
 const [open, setOpen] = useState<Answer[]>([]);
 const [candidates, setCandidates] = useState<Candidate[]>([]);
 const [selections, setSelections] = useState<Record<string, string>>({});
 const [busy, setBusy] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [points, setPoints] = useState<number | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [canManage, setCanManage] = useState(false);
 useEffect(() => { void (async () => {
  const permission = await supabase.rpc('bonus_can_manage'); setCanManage(permission.data === true);
  const { data } = await supabase.from('bonus_mitarbeiter').select('id, team:team_id(name)').eq('aktiv', true);
  const list = ((data as any[]) || []).map(m => ({ id: m.id, name: m.team?.name || m.id }));
  setMitarbeiter(list); if (list[0]) setMaId(list[0].id);
 })(); }, []);
 const load = useCallback(async () => {
  if (!maId) return;
  setLoading(true); setError(null);
  const [tokens, snapshot, matched, pending, calculation] = await Promise.all([
   supabase.from('bonus_survey_tokens').select('token,versendet_am,ausgefuellt_am,clients:client_id(name)').eq('monat', monat).eq('mitarbeiter_id', maId),
   supabase.from('bonus_kunden_snapshot').select('client_id,mitarbeiter_id,clients:client_id(name)').eq('monat', monat),
   supabase.from('bonus_survey_antworten').select('*').eq('monat', monat).eq('mitarbeiter_id', maId).in('zuordnung_status', ['automatisch', 'manuell']).order('updated_at', { ascending: false }),
   supabase.from('bonus_survey_antworten').select('*').eq('monat', monat).eq('zuordnung_status', 'offen').order('created_at', { ascending: false }),
   supabase.functions.invoke('bonus-berechnung', { body: { monat, mitarbeiter_id: maId, speichern: false } }),
  ]);
  const failure = tokens.error || snapshot.error || matched.error || pending.error || calculation.error;
  if (failure) setError(failure.message);
  setRows(((tokens.data as any[]) || []).map(t => ({ token: t.token, client_name: t.clients?.name || '–', versendet_am: t.versendet_am, ausgefuellt_am: t.ausgefuellt_am })).sort((a,b) => a.client_name.localeCompare(b.client_name)));
  setCandidates((snapshot.data || []) as Candidate[]); setAnswers((matched.data || []) as Answer[]); setOpen((pending.data || []) as Answer[]);
  setPoints((calculation.data as any)?.kein_config ? null : calculation.data?.kriterien?.zufriedenheit?.punkte ?? null); setLoading(false);
 }, [monat, maId]);
 useEffect(() => { setSelections({}); void load(); }, [load]);
 const snapshot = candidates.filter(c => c.mitarbeiter_id === maId);
 const snapshotIds = new Set(snapshot.map(c => c.client_id));
 const counted = answers.filter(a => a.client_id && snapshotIds.has(a.client_id));
 const quote = snapshotIds.size ? counted.length / snapshotIds.size * 100 : 0;
 const average = (key: 'score_betreuung' | 'score_leistung') => counted.length ? (counted.reduce((sum,a) => sum + Number(a[key]),0) / counted.length).toFixed(1) : '–';
 const uniqueCandidates = useMemo(() => candidates.filter(c => candidates.filter(other => other.client_id === c.client_id).length === 1), [candidates]);
 const generate = async () => {
  setBusy('generate');
  const result = await supabase.functions.invoke('bonus-survey-tokens-generate', { body: { monat, mitarbeiter_id: maId } });
  setBusy(null); if (result.error) return toast.error('Tokens konnten nicht erzeugt werden');
  toast.success(`${result.data?.created || 0} neue Tokens erzeugt`); void load();
 };
 const assign = async (answer: Answer, noCustomer: boolean) => {
  const clientId = selections[answer.id];
  if (!noCustomer && !uniqueCandidates.some(c => c.client_id === clientId)) return toast.error('Bitte einen Kunden auswählen');
  setBusy(answer.id);
  const result = await supabase.rpc('bonus_survey_assign', { _antwort_id: answer.id, _client_id: noCustomer ? undefined : clientId, _kein_kunde: noCustomer });
  if (result.error) { setBusy(null); toast.error('Zuordnung fehlgeschlagen', { description: result.error.message }); return; }
  const affected = (result.data as { mitarbeiter_ids?: string[] })?.mitarbeiter_ids || [];
  let recalculationFailed = false;
  for (const id of new Set([...affected, maId])) {
   const calculation = await supabase.functions.invoke('bonus-berechnung', { body: { monat, mitarbeiter_id: id, speichern: true } });
   if (calculation.error || (calculation.data as any)?.kein_config) recalculationFailed = true;
  }
  setBusy(null); toast.success(noCustomer ? 'Einsendung ausgeschlossen' : 'Kunde zugeordnet');
  if (recalculationFailed) toast.warning('Zuordnung gespeichert; Bonus konnte nicht gespeichert werden. Freigegebene Monate bleiben unverändert.');
  await load();
 };
 return <div className="space-y-6">
  <h1 className="text-2xl font-semibold font-heading">Bonus – Zufriedenheits-Funnel</h1>
  <div className="flex flex-wrap items-center gap-3">
   <a className="text-sm text-primary break-all" href={sharedLink} target="_blank" rel="noreferrer">{sharedLink}</a>
   <Button variant="ghost" size="icon" aria-label="Gemeinsamen Link kopieren" onClick={() => { void navigator.clipboard.writeText(sharedLink).then(() => toast.success('Link kopiert')); }}><Copy className="h-4 w-4" /></Button>
  </div>
  <div className="flex flex-wrap gap-3 items-center">
   <Select value={monat} onValueChange={setMonat}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent>{months().map(m => <SelectItem key={m} value={m}>{new Date(m).toLocaleDateString('de-DE',{month:'long',year:'numeric'})}</SelectItem>)}</SelectContent></Select>
   <Select value={maId} onValueChange={setMaId}><SelectTrigger className="w-56"><SelectValue placeholder="Mitarbeiter" /></SelectTrigger><SelectContent>{mitarbeiter.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent></Select>
   <Button variant="outline" size="icon" aria-label="Aktualisieren" disabled={loading} onClick={() => void load()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
  </div>
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  {canManage && <section className="space-y-3">
   <h2 className="text-lg font-semibold font-heading">Nicht zugeordnete Einsendungen <span className="text-muted-foreground tabular-nums">({open.length})</span></h2>
   {!loading && !open.length && <p className="text-sm text-muted-foreground py-4">Keine offenen Einsendungen.</p>}
   {open.map(answer => {
    const ranked = uniqueCandidates.map(c => ({ ...c, similarity: companySimilarity(answer.eingegeben_firma || '',c.clients?.name || '') })).sort((a,b) => b.similarity - a.similarity);
    const suggestion = ranked[0];
    return <article key={answer.id} className="border border-border rounded-lg p-4 min-w-0">
     <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><h3 className="text-sm font-semibold break-words">{answer.eingegeben_firma || '–'}</h3><p className="text-sm text-muted-foreground break-all">{answer.eingegeben_email}</p></div><time className="text-xs text-muted-foreground tabular-nums">{fmt(answer.updated_at)}</time></div>
     <Answers answer={answer} />
     <div className="flex flex-wrap items-center gap-2 mt-4">
      <Select value={selections[answer.id] || ''} onValueChange={id => setSelections(prev => ({...prev,[answer.id]:id}))}><SelectTrigger className="w-full sm:w-80" aria-label={`Kunde für ${answer.eingegeben_firma}`}><SelectValue placeholder="Kunden auswählen" /></SelectTrigger><SelectContent>{ranked.map(c => <SelectItem key={c.client_id} value={c.client_id}>{c.clients?.name || '–'} · {Math.round(c.similarity * 100)} %</SelectItem>)}</SelectContent></Select>
      <Button disabled={busy !== null || !selections[answer.id]} onClick={() => void assign(answer,false)}>{busy===answer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Zuordnen</Button>
      <Button variant="outline" disabled={busy !== null} onClick={() => void assign(answer,true)}><UserX className="h-4 w-4" />Kein Kunde</Button>
     </div>
     {suggestion && suggestion.similarity > 0.4 && <p className="text-xs text-muted-foreground mt-2">Vorschlag: {suggestion.clients?.name} · {Math.round(suggestion.similarity*100)} % Ähnlichkeit</p>}
    </article>;
   })}
  </section>}
  <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 border-y border-border py-5">
   <div><div className="text-xs text-muted-foreground">Ausfüllquote</div><div className="text-2xl font-semibold tabular-nums">{snapshotIds.size ? `${quote.toFixed(1)} %` : '–'}</div><div className="text-xs text-muted-foreground tabular-nums">{counted.length} / {snapshotIds.size} betreute Kunden</div></div>
   <div><div className="text-xs text-muted-foreground">Ø Score Betreuung</div><div className="text-2xl font-semibold tabular-nums">{average('score_betreuung')}</div></div>
   <div><div className="text-xs text-muted-foreground">Zufriedenheitspunkte</div><div className="text-2xl font-semibold tabular-nums">{points ?? '–'}</div></div>
   <div><div className="text-xs text-muted-foreground">Ø Score Leistung · nicht bonusrelevant</div><div className="text-2xl font-semibold tabular-nums text-muted-foreground">{average('score_leistung')}</div></div>
  </section>
  <section className="space-y-3"><h2 className="text-lg font-semibold font-heading">Zugeordnete Einsendungen</h2>{answers.map(answer => <article key={answer.id} className="border border-border rounded-lg p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="text-sm font-semibold">{candidates.find(c => c.client_id===answer.client_id)?.clients?.name || answer.eingegeben_firma || '–'}</h3><span className="text-xs text-muted-foreground">{answer.zuordnung_status} · {fmt(answer.updated_at)}</span></div><Answers answer={answer} /></article>)}{!answers.length && <p className="text-sm text-muted-foreground">Noch keine zugeordneten Einsendungen.</p>}</section>
  <details className="border-t border-border pt-5"><summary className="font-medium cursor-pointer">Monatliche Versandvorbereitung</summary><div className="mt-4 space-y-4"><p className="text-sm text-muted-foreground">Tokens erzeugen, Links kopieren und selbst an die Kunden schicken. Einen automatischen Versand gibt es nicht.</p>{canManage && <Button variant="outline" disabled={busy !== null || !maId} onClick={() => void generate()}>{busy==='generate' && <Loader2 className="h-4 w-4 animate-spin" />}Tokens erzeugen</Button>}<div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-muted-foreground"><tr>{['Kunde','Token-Link','Versendet am','Ausgefüllt am'].map(title => <th key={title} className="text-left p-3 font-medium whitespace-nowrap">{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.token} className="border-t border-border"><td className="p-3">{row.client_name}</td><td className="p-3"><Button variant="ghost" size="icon" aria-label={`Token-Link für ${row.client_name} kopieren`} onClick={() => { void navigator.clipboard.writeText(`${sharedLink}?t=${row.token}`).then(() => toast.success('Token-Link kopiert')); }}><Copy className="h-4 w-4" /></Button></td><td className="p-3 tabular-nums whitespace-nowrap">{fmt(row.versendet_am)}</td><td className="p-3 tabular-nums whitespace-nowrap">{fmt(row.ausgefuellt_am)}</td></tr>)}{!rows.length && <tr><td colSpan={4} className="p-4 text-muted-foreground">Noch keine Tokens für diesen Monat.</td></tr>}</tbody></table></div></div></details>
 </div>;
}
