import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useMetaAds } from '@/contexts/MetaAdsContext';
import { Loader2 } from 'lucide-react';
import { namensTreffer } from '@/lib/kundenVerknuepfungen';
import { ladeUntermarken, STATUS_LABEL } from '@/lib/werbebudgetKonten';

type Zeile = { untermarke: string; id: string; name: string; status: string; spend: number; vorschlag: { id: string; name: string } | null };

/** Rein lesend: aktive Kampagnen unserer Untermarken ohne Kunden-Zuordnung. Zugeordnet wird im Verknüpfungen-Tab des Kunden. */
export function KampagnenOhneKunde() {
  const { callMeta } = useMetaAds();
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState<string[]>([]);
  const [stand, setStand] = useState<Date | null>(null);

  useEffect(() => {
    (async () => {
      const [konten, z, c] = await Promise.all([
        ladeUntermarken(),
        (supabase.from as any)('werbebudget_zuordnung').select('typ, objekt_id, kampagne_id'),
        supabase.from('clients').select('id, name').is('deleted_at', null).in('kundenstatus', ['In Betreuung', 'Pausiert'] as any),
      ]);
      const vergeben = new Set<string>();
      for (const r of (z.data || []) as any[]) vergeben.add(r.typ === 'kampagne' ? r.objekt_id : r.kampagne_id);
      const kunden = ((c.data || []) as any[]).filter(k => k.name);
      const errs: string[] = [];
      const res = await Promise.all(konten.map(async k => {
        const act = k.meta_account_id.startsWith('act_') ? k.meta_account_id : `act_${k.meta_account_id}`;
        try {
          const r = await callMeta<any>(`/${act}/campaigns`, { fields: 'id,name,effective_status,insights.date_preset(last_7d){spend}', effective_status: JSON.stringify(['ACTIVE']), limit: 200 });
          return ((r?.data || []) as any[]).filter(x => x.effective_status === 'ACTIVE' && !vergeben.has(x.id)).map<Zeile>(x => {
            let best: { id: string; name: string; s: number } | null = null;
            for (const cl of kunden) { const s = namensTreffer(cl.name, x.name); if (s >= 0.6 && (!best || s > best.s)) best = { id: cl.id, name: cl.name, s }; }
            return { untermarke: k.name || k.meta_account_id, id: x.id, name: x.name, status: x.effective_status, spend: Number(x.insights?.data?.[0]?.spend || 0), vorschlag: best };
          });
        } catch (e: any) { errs.push(`${k.name || k.meta_account_id}: ${e.message}`); return []; }
      }));
      setZeilen(res.flat().sort((a, b) => b.spend - a.spend));
      setFehler(errs); setStand(new Date());
    })();
  }, [callMeta]);

  return (
    <section className="rounded-2xl bg-card shadow-sm p-5 space-y-3">
      <div>
        <h3 className="text-base font-semibold">Kampagnen ohne Kunde</h3>
        <p className="text-xs text-muted-foreground">Aktive Kampagnen unserer Untermarken, die keinem Kunden gehören. Zugeordnet wird im Verknüpfungen-Tab des Kunden.
          {stand && <> · Meta-Stand {stand.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</>}</p>
      </div>
      {!zeilen && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Kampagnen werden aus Meta geladen …</p>}
      {fehler.map(f => <p key={f} className="text-xs text-destructive">{f}</p>)}
      {zeilen?.length === 0 && <p className="text-sm text-muted-foreground">Alle aktiven Kampagnen sind einem Kunden zugeordnet.</p>}
      {zeilen && zeilen.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60">
              <th className="text-left font-medium py-2 pr-2">Untermarke</th><th className="text-left font-medium px-2">Kampagne</th>
              <th className="text-left font-medium px-2">Status</th><th className="text-right font-medium px-2">Ausgaben 7 T.</th>
              <th className="text-left font-medium pl-4">Vorschlag</th>
            </tr></thead>
            <tbody>{zeilen.map(z => (
              <tr key={z.id} className="border-b border-border/40">
                <td className="py-2 pr-2 text-muted-foreground">{z.untermarke}</td>
                <td className="px-2 py-2 break-words">{z.name}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{STATUS_LABEL[z.status] || z.status}</td>
                <td className="px-2 py-2 text-right tabular-nums">€{z.spend.toLocaleString('de-DE', { maximumFractionDigits: 0 })}</td>
                <td className="pl-4 py-2 text-xs">{z.vorschlag
                  ? <Link to={`/kunden/${z.vorschlag.id}?tab=verknuepfungen`} className="text-primary hover:underline">{z.vorschlag.name}</Link>
                  : <span className="text-muted-foreground">—</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
