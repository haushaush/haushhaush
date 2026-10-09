import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

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
    </div>
  );
}
