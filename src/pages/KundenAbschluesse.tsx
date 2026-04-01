import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ART_STYLES: Record<string, string> = {
  'Beihilfe - PKV': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'PKV': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  'BU': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'Sterbegeld': 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  'Tierkrankenversicherung': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'Erbschaftssteuer': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'Dienstleister': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const LEISTUNG_SHORT: Record<string, string> = {
  'Meta Werbeanzeigen': 'Meta Ads', 'Ads Landing Page - Onepage': 'OnePage',
  'CRM Setup & Anbindung': 'CRM', 'Vorqualifizierung': 'Vorquali', 'Superchat': 'Superchat',
};

export default function KundenAbschluesse() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [filterArt, setFilterArt] = useState('all');
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('close_deals').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setDeals(data || []);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => deals.filter(d => {
    return (filterType === 'all' || d.deal_type === filterType) && (filterArt === 'all' || d.art === filterArt);
  }), [deals, filterType, filterArt]);

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Abschlüsse</h1>
          <p className="text-muted-foreground text-sm">{deals.length} Deals</p>
        </div>
        <Button variant="outline" onClick={() => toast({ title: 'Sync angestoßen' })}>
          <RefreshCw className="h-4 w-4 mr-2" />Mit Close synchronisieren
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Typ" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Typen</SelectItem><SelectItem value="Neukunde">Neukunde</SelectItem><SelectItem value="Upsell">Upsell</SelectItem></SelectContent>
        </Select>
        <Select value={filterArt} onValueChange={setFilterArt}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Art" /></SelectTrigger>
          <SelectContent><SelectItem value="all">Alle Arten</SelectItem>{['PKV','BU','Beihilfe','Sterbegeld','Tierkranken','Erbschaftssteuer','Sonstiges'].map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Datum</TableHead><TableHead>Kunde</TableHead><TableHead>Art</TableHead><TableHead>Typ</TableHead>
            <TableHead>Wert</TableHead><TableHead>Laufzeit</TableHead><TableHead className="hidden sm:table-cell">Leistungen</TableHead><TableHead>Link</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map(d => (
              <TableRow key={d.id}>
                <TableCell className="text-muted-foreground text-xs">{new Date(d.created_at).toLocaleDateString('de-DE')}</TableCell>
                <TableCell className="font-medium">{d.client_name}</TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{d.art}</Badge></TableCell>
                <TableCell><Badge variant={d.deal_type === 'Neukunde' ? 'default' : 'secondary'} className="text-[10px]">{d.deal_type}</Badge></TableCell>
                <TableCell className="font-medium">€{Number(d.wert_eur || 0).toLocaleString('de-DE')}</TableCell>
                <TableCell className="text-muted-foreground">{d.laufzeit_monate ? `${d.laufzeit_monate}M` : '–'}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <div className="flex gap-1 flex-wrap">{Array.isArray(d.leistungen) && d.leistungen.map((l: string, i: number) => <Badge key={i} variant="outline" className="text-[9px]">{l}</Badge>)}</div>
                </TableCell>
                <TableCell>{d.close_opportunity_url && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => window.open(d.close_opportunity_url, '_blank')}><ExternalLink className="h-3 w-3" /></Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}
