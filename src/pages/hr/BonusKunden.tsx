import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

type Client = { id: string; name: string; branche: string | null; kundenstatus: string | null; startdatum: string | null };
type Mitarbeiter = { id: string; team: { name: string } | null };

const monthOptions = () => {
  const out: string[] = [];
  const d = new Date(2026, 8, 1);
  for (let i = 0; i < 18; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
};

export default function BonusKunden() {
  const [monat, setMonat] = useState('2026-10-01');
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [maId, setMaId] = useState<string>('');
  const [rows, setRows] = useState<{ id: string; client: Client }[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('bonus_mitarbeiter').select('id, team:team_id(name)');
      const list = (data as any as Mitarbeiter[]) || [];
      setMitarbeiter(list);
      if (list[0]) setMaId(list[0].id);
      const { data: cl } = await supabase.from('clients').select('id,name,branche,kundenstatus,startdatum').is('deleted_at', null).order('name');
      setAllClients((cl as Client[]) || []);
    })();
  }, []);

  const load = async () => {
    if (!maId) return;
    const { data, error } = await supabase
      .from('bonus_kunden_snapshot')
      .select('id, client:client_id(id,name,branche,kundenstatus,startdatum)')
      .eq('monat', monat).eq('mitarbeiter_id', maId);
    if (error) return toast.error(error.message);
    setRows(((data as any[]) || []).sort((a, b) => (a.client?.name || '').localeCompare(b.client?.name || '')));
  };
  useEffect(() => { load(); }, [monat, maId]);

  const inSnapshot = useMemo(() => new Set(rows.map(r => r.client?.id)), [rows]);
  const candidates = useMemo(() => {
    if (search.trim().length < 2) return [];
    const q = search.toLowerCase();
    return allClients.filter(c => !inSnapshot.has(c.id) && c.name?.toLowerCase().includes(q)).slice(0, 10);
  }, [search, allClients, inSnapshot]);

  const remove = async (id: string) => {
    const { error } = await supabase.from('bonus_kunden_snapshot').delete().eq('id', id);
    if (error) return toast.error(error.message);
    load();
  };
  const add = async (clientId: string) => {
    const { error } = await supabase.from('bonus_kunden_snapshot').insert({ monat, mitarbeiter_id: maId, client_id: clientId });
    if (error) return toast.error(error.message);
    setSearch('');
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bonus – Kundensnapshot</h1>
        <p className="text-sm text-muted-foreground">Betreute Kunden pro Monat und Mitarbeiter (Nenner der Churn-Quote).</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={monat} onValueChange={setMonat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {monthOptions().map(m => (
              <SelectItem key={m} value={m}>{new Date(m).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={maId} onValueChange={setMaId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Mitarbeiter" /></SelectTrigger>
          <SelectContent>
            {mitarbeiter.map(m => <SelectItem key={m.id} value={m.id}>{m.team?.name || m.id}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto rounded-lg border border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">Kunden gesamt </span>
          <span className="text-lg font-semibold tabular-nums text-foreground">{rows.length}</span>
        </div>
      </div>

      <div className="relative max-w-md">
        <Input placeholder="Kunde hinzufügen – Namen suchen…" value={search} onChange={e => setSearch(e.target.value)} />
        {candidates.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
            {candidates.map(c => (
              <button key={c.id} onClick={() => add(c.id)} className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted">
                <span>{c.name} <span className="text-muted-foreground">· {c.branche || '–'}</span></span>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Branche</th>
              <th className="text-left px-4 py-2 font-medium">Kundenstatus</th>
              <th className="text-left px-4 py-2 font-medium">Startdatum</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2 text-foreground">{r.client?.name}</td>
                <td className="px-4 py-2">{r.client?.branche || '–'}</td>
                <td className="px-4 py-2">{r.client?.kundenstatus || '–'}</td>
                <td className="px-4 py-2 tabular-nums">{r.client?.startdatum ? new Date(r.client.startdatum).toLocaleDateString('de-DE') : '–'}</td>
                <td className="px-2">
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Entfernen"><Trash2 className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Keine Kunden im Snapshot.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <LaufendeListe snapIds={inSnapshot} allClients={allClients} onChanged={load} />
    </div>
  );
}

const QUELLE: Record<string, string> = { close_link: 'Bestehende Verknüpfung', kunde_close_deals: 'Bestehende Verknüpfung', name: 'Gleicher Name', neu_angelegt: 'Neu angelegt – bitte prüfen', manuell: 'Von Hand zugeordnet' };

function LaufendeListe({ snapIds, allClients, onChanged }: { snapIds: Set<string | undefined>; allClients: Client[]; onChanged: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [edit, setEdit] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    supabase.from('bonus_kunden_aktuell').select('id, client_id, lead_name, close_lead_id, close_status_label, zuordnung_quelle, zaehlt_fuer_betreuung, aktiv, clients:client_id(name)').order('lead_name')
      .then(({ data }) => setRows((data as any[]) || []));
  }, [tick]);
  const call = async (body: any) => {
    const { data, error } = await supabase.functions.invoke('bonus-kunden-sync', { body });
    if (error || !data?.ok) { let m = data?.error || error?.message; try { const b = await (error as any)?.context?.json?.(); if (b?.error) m = b.error; } catch { /* */ } toast.error('Fehlgeschlagen', { description: m }); return null; }
    setTick(t => t + 1); onChanged(); return data;
  };
  const sync = async () => { setBusy(true); const d = await call({}); setBusy(false); if (d) toast.success(`${d.laufende_liste} betreute Kunden aus Close`); };
  const offen = rows.filter(r => r.zuordnung_quelle === 'neu_angelegt').length;
  const treffer = q.trim().length < 2 ? [] : allClients.filter(c => c.name?.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Laufende Kundenliste aus Close</h2>
          <p className="text-sm text-muted-foreground tabular-nums">
            {rows.filter(r => r.aktiv && r.zaehlt_fuer_betreuung).length} betreut · {rows.filter(r => !r.zaehlt_fuer_betreuung).length} ausgenommen · {offen} neu angelegt, bitte prüfen · stündlicher Abgleich
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={sync} disabled={busy}>Jetzt abgleichen</Button>
      </div>
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr><th className="text-left px-4 py-2 font-medium">Close-Lead</th><th className="text-left px-4 py-2 font-medium">Close-Status</th><th className="text-left px-4 py-2 font-medium">CRM-Kunde</th><th className="text-left px-4 py-2 font-medium">Snapshot</th><th className="text-left px-4 py-2 font-medium">Zählt für Betreuung</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="px-4 py-2"><a className="text-foreground hover:underline" href={`https://app.close.com/lead/${r.close_lead_id}/`} target="_blank" rel="noreferrer">{r.lead_name || '–'}</a></td>
                <td className="px-4 py-2 text-muted-foreground">{r.close_status_label || '–'}</td>
                <td className="px-4 py-2">
                  {edit === r.id ? (
                    <div className="relative w-64">
                      <Input autoFocus placeholder="CRM-Kunde suchen…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Escape' && setEdit(null)} />
                      {treffer.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
                        {treffer.map(c => <button key={c.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={async () => { await call({ aktion: 'zuordnen', id: r.id, client_id: c.id }); setEdit(null); setQ(''); }}>{c.name}</button>)}
                      </div>}
                    </div>
                  ) : (
                    <button className="text-left hover:underline" onClick={() => { setEdit(r.id); setQ(''); }}>
                      {r.clients?.name || '–'}
                      <span className={`block text-xs ${r.zuordnung_quelle === 'neu_angelegt' ? 'text-destructive' : 'text-muted-foreground'}`}>{QUELLE[r.zuordnung_quelle] || '–'} · ändern</span>
                    </button>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{r.client_id && snapIds.has(r.client_id) ? 'Ja' : 'Nein'}</td>
                <td className="px-4 py-2"><Switch checked={r.zaehlt_fuer_betreuung} onCheckedChange={v => call({ aktion: 'zaehlt', id: r.id, wert: v })} aria-label="Zählt für Betreuung" /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Noch kein Abgleich mit Close.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
