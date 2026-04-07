import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, ChevronDown, BarChart3 } from 'lucide-react';

type AdBudget = {
  id: string;
  werbeaccount_name: string;
  name: string;
  werbebudget: number;
  ausgegeben: number;
  remaining: number;
  laufzeit: string | null;
  startdatum: string | null;
  campaign_ids: any;
  account_id: string | null;
  pausiert: boolean;
  fixes_budget: boolean;
};

interface KundenBudgetCardProps {
  dealId: string;
  clientName: string;
}

export function KundenBudgetCard({ dealId, clientName }: KundenBudgetCardProps) {
  const [budgets, setBudgets] = useState<AdBudget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // Match by client_id or name
      const { data } = await supabase.from('ad_budgets').select('*');
      const all = (data as any[] || []) as AdBudget[];
      const matched = all.filter(b =>
        b.client_id === dealId ||
        b.werbeaccount_name.toLowerCase().includes(clientName.toLowerCase()) ||
        clientName.toLowerCase().includes(b.werbeaccount_name.toLowerCase())
      );
      setBudgets(matched);
      setLoading(false);
    };
    load();
  }, [dealId, clientName]);

  if (loading || budgets.length === 0) return null;

  return (
    <>
      {budgets.map(b => {
        const pct = b.werbebudget > 0 ? Math.min(120, (b.ausgegeben / b.werbebudget) * 100) : 0;
        const isOver = b.ausgegeben > b.werbebudget;
        const campaigns = Array.isArray(b.campaign_ids) ? b.campaign_ids : [];

        return (
          <Card key={b.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Meta Werbebudget
                </CardTitle>
                <span className="text-xs font-mono text-muted-foreground">{b.account_id}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>€{Number(b.ausgegeben).toLocaleString('de-DE')} ausgegeben</span>
                  <span className="text-muted-foreground">€{Number(b.werbebudget).toLocaleString('de-DE')} Budget</span>
                </div>
                <Progress
                  value={Math.min(100, pct)}
                  className={`h-3 ${pct > 100 ? '[&>div]:bg-destructive' : pct > 80 ? '[&>div]:bg-orange-500' : ''}`}
                />
                <p className="text-xs text-muted-foreground">{pct.toFixed(0)}% verbraucht</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className={`font-medium ${isOver ? 'text-destructive' : 'text-emerald-500'}`}>
                    {isOver ? `-€${Math.abs(Number(b.remaining)).toLocaleString('de-DE')}` : `€${Number(b.remaining).toLocaleString('de-DE')}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Laufzeit</p>
                  <p className="font-medium">{b.laufzeit || '–'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Start</p>
                  <p className="font-medium">{b.startdatum || '–'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={b.pausiert ? 'secondary' : 'default'} className="text-xs">
                    {b.pausiert ? 'Pausiert' : 'Aktiv'}
                  </Badge>
                </div>
              </div>

              {/* Campaigns collapsible */}
              {campaigns.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline">
                    <ChevronDown className="h-3 w-3" />
                    {campaigns.length} Kampagne{campaigns.length > 1 ? 'n' : ''} anzeigen
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 flex flex-wrap gap-1">
                    {campaigns.map((cid: string, i: number) => (
                      <Badge key={i} variant="outline" className="font-mono text-[10px]">{cid}</Badge>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {b.account_id && (
                  <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => window.open(`https://business.facebook.com/adsmanager/manage/campaigns?act=${b.account_id?.replace('act_', '')}`, '_blank')}>
                    <ExternalLink className="h-3 w-3" /> In Meta öffnen
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
