import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type Row = { token: string; client_name: string; versendet_am: string | null; ausgefuellt_am: string | null };

const months = () => {
  const out: string[] = []; const d = new Date(2026, 8, 1);
  for (let i = 0; i < 18; i++) { out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); d.setMonth(d.getMonth() + 1); }
  return out;
};
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const link = (t: string) => `https://leadsharks.de/zufriedenheit?t=${t}`;

export default function BonusFunnel() {
  const [monat, setMonat] = useState('2026-11-01');
  const [mitarbeiter, setMitarbeiter] = useState<{ id: string; name: string }[]>([]);
  const [maId, setMaId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [avgB, setAvgB] = useState<number | null>(null);
  const [avgL, setAvgL] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('bonus_mitarbeiter').select('id, team:team_id(name)').then(({ data }) => {
      const l = ((data as any[]) || []).map(m => ({ id: m.id, name: m.team?.name || m.id }));
      setMitarbeiter(l); if (l[0]) setMaId(l[0].id);
    });
  }, []);

  const load = async () => {
    if (!maId) return;
    const { data, error } = await supabase.from('bonus_survey_tokens')
      .select('token, versendet_am, ausgefuellt_am, clients:client_id(name)')
      .eq('monat', monat).eq('mitarbeiter_id', maId);
    if (error) return toast.error(error.message);
    const r = ((data as any[]) || []).map(t => ({ token: t.token, client_name: t.clients?.name || '–', versendet_am: t.versendet_am, ausgefuellt_am: t.ausgefuellt_am }))
      .sort((a, b) => a.client_name.localeCompare(b.client_name));
    setRows(r);
    if (r.length) {
      const { data: ans } = await supabase.from('bonus_survey_antworten').select('score_betreuung, score_leistung').in('token', r.map(x => x.token));
      const a = (ans as any[]) || [];
      const avg = (k: string) => (a.length ? a.reduce((s, x) => s + Number(x[k] || 0), 0) / a.length : null);
      setAvgB(avg('score_betreuung')); setAvgL(avg('score_leistung'));
    } else { setAvgB(null); setAvgL(null); }
  };
  useEffect(() => { load(); }, [monat, maId]);

  const generate = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('bonus-survey-tokens-generate', { body: { monat, mitarbeiter_id: maId } });
    setBusy(false);
    if (error) return toast.error('Tokens konnten nicht erzeugt werden', { description: error.message });
    toast.success(`${data?.created ?? 0} neue Tokens erzeugt`);
    load();
  };

  const filled = rows.filter(r => r.ausgefuellt_am).length;
  const quote = rows.length ? (filled / rows.length) * 100 : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bonus – Zufriedenheits-Funnel</h1>
        <p className="text-sm text-muted-foreground">Empfänger kommen ausschließlich aus dem Kundensnapshot des Monats.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={monat} onValueChange={setMonat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{months().map(m => <SelectItem key={m} value={m}>{new Date(m).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={maId} onValueChange={setMaId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Mitarbeiter" /></SelectTrigger>
          <SelectContent>{mitarbeiter.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={generate} disabled={busy || !maId}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Tokens erzeugen</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border p-4">
          <div className="text-xs text-muted-foreground">Ausfüllquote</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">{quote === null ? '–' : `${quote.toFixed(1)} %`}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{filled} / {rows.length} ausgefüllt</div>
        </div>
        <div className="rounded-lg border border-border p-4">
          <div className="text-xs text-muted-foreground">Ø Score Betreuung (bonusrelevant)</div>
          <div className="text-2xl font-semibold tabular-nums text-foreground">{avgB === null ? '–' : avgB.toFixed(1)}</div>
        </div>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
        <div className="text-xs text-muted-foreground">Ø Score Leistung</div>
        <div className="text-xl font-semibold tabular-nums text-muted-foreground">{avgL === null ? '–' : avgL.toFixed(1)}</div>
        <div className="text-xs text-muted-foreground mt-1">Fließt NICHT in den Bonus ein – misst die Kampagnen-Performance, auf die der CSM keinen Einfluss hat.</div>
      </div>

      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Kunde</th>
              <th className="text-left px-4 py-2 font-medium">Link</th>
              <th className="text-left px-4 py-2 font-medium">Versendet am</th>
              <th className="text-left px-4 py-2 font-medium">Ausgefüllt am</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.token} className="border-t border-border">
                <td className="px-4 py-2 text-foreground">{r.client_name}</td>
                <td className="px-4 py-2">
                  <button className="inline-flex items-center gap-1 text-primary hover:underline font-mono text-xs"
                    onClick={() => { navigator.clipboard.writeText(link(r.token)); toast.success('Link kopiert'); }}>
                    <Copy className="h-3 w-3" />…?t={r.token.slice(0, 8)}…
                  </button>
                </td>
                <td className="px-4 py-2 tabular-nums">{fmt(r.versendet_am)}</td>
                <td className="px-4 py-2 tabular-nums">{fmt(r.ausgefuellt_am)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Noch keine Tokens für diesen Monat.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
