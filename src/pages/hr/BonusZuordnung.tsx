import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

type Client = { id: string; name: string };
type Empf = { name: string; qid: string | null; count: number; sum: number };

const eur = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const bigrams = (s: string) => { const t = ` ${norm(s)} `; const out: string[] = []; for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2)); return out; };
function similarity(a: string, b: string) {
  const A = bigrams(a), B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const m = new Map<string, number>(); A.forEach(x => m.set(x, (m.get(x) || 0) + 1));
  let hit = 0; B.forEach(x => { const c = m.get(x) || 0; if (c) { hit++; m.set(x, c - 1); } });
  return (2 * hit) / (A.length + B.length);
}

export default function BonusZuordnung() {
  const [inv, setInv] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [ign, setIgn] = useState<any[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [snap, setSnap] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Empf | null>(null);
  const [q, setQ] = useState('');
  const [nurSnap, setNurSnap] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (async () => {
      const [a, b, c, d] = await Promise.all([
        supabase.from('qonto_client_invoices').select('client_name, client_id, subtotal_amount').eq('status', 'paid').limit(20000),
        supabase.from('qonto_client_links').select('id, qonto_client_name, client_id, is_confirmed'),
        supabase.from('bonus_cash_ignorierte_empfaenger').select('id, qonto_client_name'),
        supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
      ]);
      setInv(a.data || []); setLinks(b.data || []); setIgn(c.data || []); setClients((d.data as Client[]) || []);
      const { data: last } = await supabase.from('bonus_kunden_snapshot').select('monat').order('monat', { ascending: false }).limit(1);
      if (last?.[0]) {
        const { data: s } = await supabase.from('bonus_kunden_snapshot').select('client_id').eq('monat', last[0].monat);
        setSnap(new Set((s || []).map((x: any) => x.client_id)));
      }
    })();
  }, [tick]);

  const confirmed = useMemo(() => new Map(links.filter(l => l.is_confirmed && l.client_id).map(l => [l.qonto_client_name.trim().toLowerCase(), l.client_id])), [links]);
  const ignored = useMemo(() => new Set(ign.map(i => i.qonto_client_name.trim().toLowerCase())), [ign]);
  const offen = useMemo(() => {
    const m = new Map<string, Empf>();
    for (const i of inv) {
      const n = (i.client_name || '').trim(); if (!n) continue;
      const k = n.toLowerCase(); if (confirmed.has(k) || ignored.has(k)) continue;
      const e = m.get(k) || { name: n, qid: i.client_id, count: 0, sum: 0 };
      e.count++; e.sum += Number(i.subtotal_amount) || 0; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.sum - a.sum);
  }, [inv, confirmed, ignored]);
  const linkedClients = useMemo(() => new Set(confirmed.values()), [confirmed]);
  const snapLinked = [...snap].filter(id => linkedClients.has(id)).length;
  const offenEur = offen.reduce((s, e) => s + e.sum, 0);

  const rechts = useMemo(() => {
    let list = clients.filter(c => !nurSnap || snap.has(c.id));
    if (q.trim()) list = list.filter(c => c.name?.toLowerCase().includes(q.toLowerCase()));
    const scored = list.map(c => ({ ...c, score: sel ? similarity(sel.name, c.name || '') : 0, verknuepft: linkedClients.has(c.id) }));
    return sel ? scored.sort((a, b) => b.score - a.score) : scored;
  }, [clients, snap, nurSnap, q, sel, linkedClients]);

  const zuordnen = async (c: Client, score: number) => {
    if (!sel) return;
    const existing = links.find(l => l.qonto_client_name.trim().toLowerCase() === sel.name.toLowerCase());
    const row = { qonto_client_name: sel.name, qonto_client_id: sel.qid, client_id: c.id, is_confirmed: true, match_type: 'manual', confidence: Math.round(score * 100) / 100, updated_at: new Date().toISOString() };
    const { error } = existing ? await supabase.from('qonto_client_links').update(row).eq('id', existing.id) : await supabase.from('qonto_client_links').insert(row);
    if (error) return toast.error(error.message);
    toast.success(`${sel.name} → ${c.name}`); setSel(null); setQ(''); setTick(t => t + 1);
  };
  const keinKunde = async (e: Empf) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('bonus_cash_ignorierte_empfaenger').insert({ qonto_client_name: e.name, angelegt_von: u.user?.id ?? null });
    if (error) return toast.error(error.message);
    toast.success(`${e.name} wird ignoriert`); if (sel?.name === e.name) setSel(null); setTick(t => t + 1);
  };
  const reaktivieren = async (id: string) => { await supabase.from('bonus_cash_ignorierte_empfaenger').delete().eq('id', id); setTick(t => t + 1); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold font-heading text-foreground">Bonus – Zahlungs-Zuordnung</h1>
        <p className="text-sm text-muted-foreground">Qonto-Rechnungsempfänger einmalig den CRM-Kunden zuordnen. Vorschläge werden nie automatisch bestätigt.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="text-xs text-muted-foreground">Betreute Kunden verknüpft</div>
          <div className="text-2xl font-semibold tabular-nums">{snapLinked} von {snap.size}</div>
          <Progress value={snap.size ? (snapLinked / snap.size) * 100 : 0} />
        </div>
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="text-xs text-muted-foreground">Bezahlte Rechnungen ohne Zuordnung (netto)</div>
          <div className="text-2xl font-semibold tabular-nums">{eur(offenEur)}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{offen.length} Rechnungsempfänger offen</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 text-sm font-medium">Qonto-Rechnungsempfänger ohne Zuordnung</div>
          <div className="max-h-[560px] overflow-auto divide-y divide-border">
            {offen.map(e => (
              <div key={e.name} className={`flex items-center gap-2 px-4 py-2 text-sm ${sel?.name === e.name ? 'bg-primary/10' : ''}`}>
                <button className="flex-1 min-w-0 text-left" onClick={() => setSel(e)}>
                  <div className="truncate text-foreground">{e.name}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{e.count} Rechnungen · {eur(e.sum)}</div>
                </button>
                <Button size="sm" variant="ghost" onClick={() => keinKunde(e)}>Kein Kunde</Button>
              </div>
            ))}
            {offen.length === 0 && <div className="px-4 py-8 text-center text-sm text-muted-foreground">Alles zugeordnet.</div>}
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 text-sm font-medium flex items-center justify-between gap-2">
            <span>{sel ? `Kunde für „${sel.name}" wählen` : 'CRM-Kunden'}</span>
            <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">Nur betreute <Switch checked={nurSnap} onCheckedChange={setNurSnap} /></label>
          </div>
          <div className="p-2"><Input placeholder="Kunde suchen…" value={q} onChange={e => setQ(e.target.value)} /></div>
          <div className="max-h-[510px] overflow-auto divide-y divide-border">
            {rechts.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-foreground">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.verknuepft ? 'bereits verknüpft' : 'noch ohne Qonto-Verknüpfung'}{sel && c.score >= 0.4 ? ` · Vorschlag ${Math.round(c.score * 100)} %` : ''}</div>
                </div>
                {sel && <Button size="sm" variant={c.score >= 0.6 ? 'default' : 'outline'} onClick={() => zuordnen(c, c.score)}>Zuordnen</Button>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {ign.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold font-heading">Dauerhaft ignoriert ({ign.length})</h2>
          <div className="flex flex-wrap gap-2">
            {ign.map(i => <span key={i.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">{i.qonto_client_name}<button aria-label="Wieder aufnehmen" onClick={() => reaktivieren(i.id)}><Trash2 className="h-3 w-3 text-muted-foreground" /></button></span>)}
          </div>
        </div>
      )}

      <Ausschluesse />
    </div>
  );
}

function Ausschluesse() {
  const [rows, setRows] = useState<any[]>([]);
  const [neu, setNeu] = useState('');
  const load = () => supabase.from('bonus_cash_ausschluesse').select('*').order('begriff').then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!neu.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('bonus_cash_ausschluesse').insert({ begriff: neu.trim(), angelegt_von: u.user?.id ?? null });
    if (error) return toast.error(error.message);
    setNeu(''); load();
  };
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold font-heading text-foreground">Werbebudget-Begriffe</h2>
        <p className="text-sm text-muted-foreground">Rechnungspositionen, deren Titel einen dieser Begriffe enthält, werden vom Netto-Betrag abgezogen. Groß-/Kleinschreibung, Leerzeichen und Bindestriche werden ignoriert.</p>
      </div>
      <div className="flex gap-2 max-w-md"><Input placeholder="Neuer Begriff" value={neu} onChange={e => setNeu(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} /><Button onClick={add}>Hinzufügen</Button></div>
      <div className="rounded-lg border border-border divide-y divide-border max-w-md">
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span className={r.aktiv ? 'text-foreground' : 'text-muted-foreground line-through'}>{r.begriff}</span>
            <span className="flex items-center gap-2">
              <Switch checked={r.aktiv} onCheckedChange={async v => { await supabase.from('bonus_cash_ausschluesse').update({ aktiv: v }).eq('id', r.id); load(); }} />
              <Button size="icon" variant="ghost" aria-label="Löschen" onClick={async () => { await supabase.from('bonus_cash_ausschluesse').delete().eq('id', r.id); load(); }}><Trash2 className="h-4 w-4" /></Button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
