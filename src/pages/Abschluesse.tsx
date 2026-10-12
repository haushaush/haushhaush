import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink } from 'lucide-react';

type Abschluss = {
  close_opportunity_id: string; close_lead_id: string | null; lead_name: string | null; status_label: string | null; status_typ: string | null;
  status_geaendert_am: string | null; abschlusswert: number | null; setup_fee: number | null; retainer_monat: number | null;
  laufzeit_monate: number | null; startdatum: string | null; leistungen: string | null; deal_typ: string | null; closer: string | null;
  setter: string | null; marke: string; branche: string | null; quelle: string; dublette_von: string | null;
};
type Lead = { close_lead_id: string; name: string | null; status_label: string | null; marke: string | null; branche: string | null; kanal: string | null; status_geaendert_am: string | null; date_updated: string | null };

const eur = (n: number | null | undefined) => n == null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const dt = (d: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const TYP: Record<string, string> = { won: 'Gewonnen', lost: 'Verloren', active: 'Offen' };
const closeLink = (leadId: string | null) => leadId ? `https://app.close.com/lead/${leadId}/` : undefined;

export default function Abschluesse() {
  const [rows, setRows] = useState<Abschluss[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [marke, setMarke] = useState('alle');
  const [typ, setTyp] = useState('won');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [leadStatus, setLeadStatus] = useState('alle');
  const [stand, setStand] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [a, l, s] = await Promise.all([
        supabase.from('close_abschluesse_alle').select('quelle, dublette_von, close_opportunity_id, close_lead_id, lead_name, status_label, status_typ, status_geaendert_am, abschlusswert, setup_fee, retainer_monat, laufzeit_monate, startdatum, leistungen, deal_typ, closer, setter, marke, branche').order('status_geaendert_am', { ascending: false }).limit(10000),
        supabase.from('close_lead_spiegel').select('close_lead_id, name, status_label, marke, branche, kanal, status_geaendert_am, date_updated').order('date_updated', { ascending: false }).limit(10000),
        supabase.from('close_sync_stand').select('letzter_lauf').eq('name', 'close_abschluesse').maybeSingle(),
      ]);
      setRows((a.data as Abschluss[]) || []); setLeads((l.data as Lead[]) || []); setStand(s.data?.letzter_lauf ?? null); setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter(r =>
    (marke === 'alle' || r.marke === marke) && (typ === 'alle' || r.status_typ === typ) &&
    (!von || (r.status_geaendert_am || '') >= von) && (!bis || (r.status_geaendert_am || '').slice(0, 10) <= bis)), [rows, marke, typ, von, bis]);

  const summen = useMemo(() => {
    const m = new Map<string, { monat: string; marke: string; n: number; aw: number; sf: number; rt: number }>();
    for (const r of filtered) {
      if (r.dublette_von) continue; // duplicate of one of our deals: shown, not counted
      const monat = (r.status_geaendert_am || '').slice(0, 7) || '–';
      const k = `${monat}|${r.marke}`;
      const e = m.get(k) || { monat, marke: r.marke, n: 0, aw: 0, sf: 0, rt: 0 };
      e.n++; e.aw += r.abschlusswert || 0; e.sf += r.setup_fee || 0; e.rt += r.retainer_monat || 0; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.monat.localeCompare(a.monat) || a.marke.localeCompare(b.marke));
  }, [filtered]);

  const leadStatuses = useMemo(() => [...new Set(leads.map(l => l.status_label).filter(Boolean))] as string[], [leads]);
  const leadsFiltered = leads.filter(l => leadStatus === 'alle' || l.status_label === leadStatus);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-heading font-bold">Abschlüsse</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Haush-Haush-Close (Pipeline „Sales“) und Viral Connect (Noahs Close, nur gelesen). Dublettenverdacht: gleicher Kunde, Monat und Abschlusswert – zählt nicht in die Summen{stand ? ` · letzter Abgleich ${new Date(stand).toLocaleString('de-DE')}` : ''}</p>
      </div>
      <Tabs defaultValue="abschluesse">
        <TabsList>
          <TabsTrigger value="abschluesse">Abschlüsse ({rows.length})</TabsTrigger>
          <TabsTrigger value="leads">Alle Leads ({leads.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="abschluesse" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={marke} onValueChange={setMarke}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="alle">Alle Marken</SelectItem><SelectItem value="LeadSharks">LeadSharks</SelectItem><SelectItem value="Viral Connect">Viral Connect</SelectItem></SelectContent></Select>
            <Select value={typ} onValueChange={setTyp}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="alle">Alle Status</SelectItem><SelectItem value="won">Gewonnen</SelectItem><SelectItem value="active">Offen</SelectItem><SelectItem value="lost">Verloren</SelectItem></SelectContent></Select>
            <Input type="date" value={von} onChange={e => setVon(e.target.value)} className="w-40" aria-label="Von" />
            <Input type="date" value={bis} onChange={e => setBis(e.target.value)} className="w-40" aria-label="Bis" />
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Summen je Marke und Monat</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Monat</TableHead><TableHead>Marke</TableHead><TableHead className="text-right">Anzahl</TableHead><TableHead className="text-right">Abschlusswert</TableHead><TableHead className="text-right">Setup-Fee</TableHead><TableHead className="text-right">Retainer/Monat</TableHead></TableRow></TableHeader>
                <TableBody>
                  {summen.map(s => <TableRow key={s.monat + s.marke}><TableCell>{s.monat}</TableCell><TableCell>{s.marke}</TableCell><TableCell className="text-right tabular-nums">{s.n}</TableCell><TableCell className="text-right tabular-nums">{eur(s.aw)}</TableCell><TableCell className="text-right tabular-nums">{eur(s.sf)}</TableCell><TableCell className="text-right tabular-nums">{eur(s.rt)}</TableCell></TableRow>)}
                  {!summen.length && !loading && <TableRow><TableCell colSpan={6} className="text-muted-foreground text-sm">Keine Abschlüsse im Filter.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-4 overflow-x-auto">
            {loading ? <Skeleton className="h-40" /> : (
              <Table>
                <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Kunde</TableHead><TableHead>Status</TableHead><TableHead>Marke</TableHead><TableHead>Quelle</TableHead><TableHead className="text-right">Abschlusswert</TableHead><TableHead className="text-right">Setup</TableHead><TableHead className="text-right">Retainer</TableHead><TableHead>Laufzeit</TableHead><TableHead>Start</TableHead><TableHead>Closer</TableHead><TableHead>Setter</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.close_opportunity_id} className={r.dublette_von ? 'opacity-60' : ''}>
                      <TableCell className="tabular-nums">{dt(r.status_geaendert_am)}</TableCell>
                      <TableCell className="font-medium">{r.lead_name}<div className="text-xs text-muted-foreground">{[r.deal_typ, r.leistungen, r.branche].filter(Boolean).join(' · ')}</div></TableCell>
                      <TableCell><Badge variant="outline">{TYP[r.status_typ || ''] || r.status_typ}</Badge><div className="text-xs text-muted-foreground">{r.status_label}</div></TableCell>
                      <TableCell>{r.marke}</TableCell>
                      <TableCell className="text-xs">{r.quelle}{r.dublette_von && <Badge variant="secondary" className="ml-1">Dublettenverdacht</Badge>}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(r.abschlusswert)}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(r.setup_fee)}</TableCell>
                      <TableCell className="text-right tabular-nums">{eur(r.retainer_monat)}</TableCell>
                      <TableCell className="tabular-nums">{r.laufzeit_monate ? `${r.laufzeit_monate} Mon.` : '–'}</TableCell>
                      <TableCell className="tabular-nums">{dt(r.startdatum)}</TableCell>
                      <TableCell>{r.closer || '–'}</TableCell>
                      <TableCell>{r.setter || '–'}</TableCell>
                      <TableCell>{closeLink(r.close_lead_id) && <a href={closeLink(r.close_lead_id)} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">Close <ExternalLink className="h-3 w-3" /></a>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="leads" className="space-y-4">
          <Select value={leadStatus} onValueChange={setLeadStatus}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="alle">Alle Status</SelectItem>{leadStatuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
          <Card><CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Lead</TableHead><TableHead>Status</TableHead><TableHead>Marke</TableHead><TableHead>Branche</TableHead><TableHead>Kanal</TableHead><TableHead>Status geändert</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {leadsFiltered.slice(0, 500).map(l => (
                  <TableRow key={l.close_lead_id}>
                    <TableCell className="font-medium">{l.name}</TableCell><TableCell>{l.status_label}</TableCell><TableCell>{l.marke || '–'}</TableCell>
                    <TableCell>{l.branche || '–'}</TableCell><TableCell>{l.kanal || '–'}</TableCell><TableCell className="tabular-nums">{dt(l.status_geaendert_am)}</TableCell>
                    <TableCell><a href={closeLink(l.close_lead_id)} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">Close <ExternalLink className="h-3 w-3" /></a></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {leadsFiltered.length > 500 && <p className="text-xs text-muted-foreground mt-2">Die ersten 500 von {leadsFiltered.length} angezeigt — bitte nach Status filtern.</p>}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
