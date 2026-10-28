import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ladeKontenJeKunde, wirksamerBudgetTraeger, type KontoInfo } from '@/lib/budgetTraeger';
import { HEALTH_KARTE, HealthKopf, FARBE } from '@/components/finanzen/HealthKarte';

/** Budgetträger („über uns" / „über den Kunden") und monatlicher Cap auf Kundenebene. */
export function BudgetTraegerAuswahl({ clientId, pflicht, adsBudget, onSaved }: {
  clientId: string; pflicht: boolean | null; adsBudget: number | null;
  onSaved: (patch: { werbebudget_pflicht?: boolean; ads_budget?: number | null }) => void;
}) {
  const [konten, setKonten] = useState<KontoInfo[] | null>(null);
  const [cap, setCap] = useState(adsBudget != null ? String(adsBudget).replace('.', ',') : '');
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => { ladeKontenJeKunde([clientId]).then(m => setKonten(m.get(clientId) || [])); }, [clientId]);
  useEffect(() => { setCap(adsBudget != null ? String(adsBudget).replace('.', ',') : ''); }, [adsBudget]);

  const arten = (konten || []).map(k => k.art || '');
  const untermarke = arten.includes('untermarke');
  const wirksam = wirksamerBudgetTraeger(arten, pflicht);

  const setzen = async (uns: boolean) => {
    if (untermarke || speichert || (pflicht === true) === uns) return;
    setSpeichert(true);
    const { error } = await supabase.from('clients').update({ werbebudget_pflicht: uns } as any).eq('id', clientId);
    setSpeichert(false);
    if (error) { toast.error('Speichern fehlgeschlagen', { description: error.message }); return; }
    onSaved({ werbebudget_pflicht: uns });
  };

  const capSpeichern = async () => {
    const t = cap.trim().replace(/\./g, '').replace(',', '.');
    const wert = t === '' ? null : Number(t);
    if (wert != null && (!Number.isFinite(wert) || wert < 0)) { toast.error('Bitte einen gültigen Betrag eingeben'); return; }
    setSpeichert(true);
    const { error } = await supabase.from('clients').update({ ads_budget: wert } as any).eq('id', clientId);
    setSpeichert(false);
    if (error) { toast.error('Speichern fehlgeschlagen', { description: error.message }); return; }
    toast.success('Monatliches Werbebudget gespeichert');
    onSaved({ ads_budget: wert });
  };

  const Kachel = ({ uns, titel }: { uns: boolean; titel: string }) => {
    const aktiv = (wirksam === 'uns') === uns;
    return (
      <button type="button" disabled={untermarke || speichert} onClick={() => setzen(uns)} aria-pressed={aktiv}
        title={untermarke ? 'Untermarken-Konto — läuft immer über uns' : undefined}
        className={cn('rounded-2xl border p-4 text-left text-sm font-medium transition-colors',
          aktiv ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          untermarke && 'opacity-60 cursor-not-allowed hover:border-border')}>
        {titel}
      </button>
    );
  };

  return (
    <div className={HEALTH_KARTE}>
      <HealthKopf titel="Werbebudget" farbe={wirksam === 'uns' ? FARBE.primaer : FARBE.grau} />
      {konten === null ? <p className="text-sm text-muted-foreground mt-3">Konten werden geladen …</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Kachel uns titel="Budget läuft über uns" />
            <Kachel uns={false} titel="Budget läuft über den Kunden" />
          </div>
          {untermarke && <p className="text-xs text-muted-foreground mt-2">Untermarken-Konto — läuft immer über uns</p>}
          {wirksam === 'uns' && (
            <div className="mt-4 space-y-1.5">
              <label htmlFor="ads-cap" className="text-sm font-medium">Monatliches Werbebudget (Cap)</label>
              <div className="flex gap-2 max-w-sm">
                <Input id="ads-cap" inputMode="decimal" value={cap} onChange={e => setCap(e.target.value)} placeholder="z. B. 3.000" className="tabular-nums" />
                <Button variant="outline" onClick={capSpeichern} disabled={speichert}>Speichern</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
