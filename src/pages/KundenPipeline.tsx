import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';

const COLUMNS = ['Lead', 'Qualifiziert', 'Angebot', 'Abschluss', 'Aktiv', 'Pausiert', 'Churned'];
const AMPEL_DOT: Record<string, string> = { 'Grün': 'bg-success', 'Gelb': 'bg-warning', 'Rot': 'bg-destructive' };

export default function KundenPipeline() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from('close_deals').select('*').order('created_at', { ascending: false }).then(({ data }) => {
      setDeals(data || []);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    COLUMNS.forEach(c => map[c] = []);
    deals.forEach(d => {
      const col = COLUMNS.includes(d.status) ? d.status : 'Aktiv';
      map[col].push(d);
    });
    return map;
  }, [deals]);

  if (loading) return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-muted-foreground text-sm">Kunden-Pipeline nach Status</p>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => (
          <div key={col} className="min-w-[260px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{col}</p>
              <Badge variant="secondary" className="text-[10px]">{grouped[col].length}</Badge>
            </div>
            <div className="space-y-2">
              {grouped[col].map(d => (
                <Card key={d.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/kunden/${d.id}`)}>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate">{d.client_name}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">{d.art}</Badge>
                      <span className="text-xs text-muted-foreground">€{Number(d.wert_eur || 0).toLocaleString('de-DE')}</span>
                      <span className={`h-2 w-2 rounded-full ${AMPEL_DOT[d.ampelstatus] || 'bg-muted'}`} aria-label={`Ampel: ${d.ampelstatus}`} />
                    </div>
                  </CardContent>
                </Card>
              ))}
              {grouped[col].length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Keine Deals</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
