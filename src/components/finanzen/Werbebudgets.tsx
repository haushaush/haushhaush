import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/StatCard';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, AlertTriangle, TrendingDown, DollarSign, ExternalLink, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { sendSlackMessage } from '@/lib/slack';
import { useAuth } from '@/contexts/AuthContext';

type AdBudget = {
  id: string;
  client_id: string | null;
  werbeaccount_name: string;
  name: string;
  werbebudget: number;
  ausgegeben: number;
  remaining: number;
  laufzeit: string | null;
  startdatum: string | null;
  campaign_ids: any;
  account_id: string | null;
  fixes_budget: boolean;
  pausiert: boolean;
  mail_gesendet: boolean;
  alert: boolean;
  alert_200_sent_at: string | null;
  alert_ueberschritten_sent_at: string | null;
  invoice_ticket_created: boolean;
  last_synced_at: string | null;
  sync_status: string | null;
};

type FilterType = 'alle' | 'aktiv' | 'ueberschritten' | 'warnung' | 'pausiert' | 'fixes';

const FILTER_LABELS: Record<FilterType, string> = {
  alle: 'Alle',
  aktiv: 'Aktiv',
  ueberschritten: 'Überschritten',
  warnung: 'Warnung',
  pausiert: 'Pausiert',
  fixes: 'Fixes Budget',
};

function getStatus(b: AdBudget): { label: string; color: string; dot: string } {
  if (b.pausiert) return { label: 'Pausiert', color: 'text-muted-foreground', dot: 'bg-muted-foreground' };
  if (b.ausgegeben > b.werbebudget) return { label: 'Überschritten', color: 'text-destructive', dot: 'bg-destructive' };
  if (b.remaining > 0 && b.remaining <= 200) return { label: 'Warnung', color: 'text-orange-500', dot: 'bg-orange-500' };
  if (b.remaining > 200 && b.remaining <= 500) return { label: 'Knapp', color: 'text-yellow-500', dot: 'bg-yellow-500' };
  return { label: 'OK', color: 'text-emerald-500', dot: 'bg-emerald-500' };
}

function pctUsed(b: AdBudget): number {
  if (b.werbebudget <= 0) return 0;
  return Math.min(120, (b.ausgegeben / b.werbebudget) * 100);
}

function progressColor(pct: number): string {
  if (pct > 100) return '[&>div]:bg-destructive';
  if (pct > 95) return '[&>div]:bg-destructive';
  if (pct > 80) return '[&>div]:bg-orange-500';
  return '';
}

export function Werbebudgets() {
  const [budgets, setBudgets] = useState<AdBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('alle');
  const [sortBy, setSortBy] = useState<'remaining' | 'budget' | 'ausgegeben' | 'name'>('remaining');
  const { toast } = useToast();
  const { isAdminOrManager } = useAuth();

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ad_budgets').select('*').order('created_at', { ascending: false });
    setBudgets((data as any[] || []) as AdBudget[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  // Auto-sync Meta spend into ad_budgets
  const syncMetaSpendToWerbebudgets = useCallback(async () => {
    const { data: setting } = await supabase
      .from('integration_settings')
      .select('config')
      .eq('provider', 'meta_ads')
      .maybeSingle();
    
    const cfg = setting?.config as any;
    if (!cfg?.account_mappings) return;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: insights } = await supabase
      .from('meta_insights')
      .select('ad_account_id, spend')
      .gte('date_start', thirtyDaysAgo.toISOString().split('T')[0]);

    if (!insights?.length) return;

    const spendByAccount: Record<string, number> = {};
    insights.forEach(row => {
      spendByAccount[row.ad_account_id] = (spendByAccount[row.ad_account_id] || 0) + Number(row.spend || 0);
    });

    for (const [accountId, spend] of Object.entries(spendByAccount)) {
      await supabase
        .from('ad_budgets')
        .update({ ausgegeben: spend, last_synced_at: new Date().toISOString(), sync_status: 'success' })
        .eq('account_id', accountId);
    }
  }, []);

  useEffect(() => { syncMetaSpendToWerbebudgets(); }, [syncMetaSpendToWerbebudgets]);

  // Alert check on load
  useEffect(() => {
    if (budgets.length === 0) return;
    checkBudgetAlerts(budgets);
  }, [budgets]);

  const checkBudgetAlerts = async (items: AdBudget[]) => {
    for (const budget of items) {
      if (budget.pausiert) continue;
      const remaining = budget.werbebudget - budget.ausgegeben;

      if (budget.ausgegeben > budget.werbebudget && !budget.alert_ueberschritten_sent_at) {
        await sendSlackMessage({
          title: `🔴 Werbebudget überschritten: ${budget.werbeaccount_name}`,
          emoji: '🚨',
          color: 'red',
          message: `*${budget.name}* hat das Budget um *€${Math.abs(remaining).toFixed(2)}* überschritten.\nAccount: \`${budget.account_id}\``,
          fields: [
            { label: 'Budget (Soll)', value: `€${budget.werbebudget}` },
            { label: 'Ausgegeben (Ist)', value: `€${budget.ausgegeben}` },
            { label: 'Überschreitung', value: `€${Math.abs(remaining).toFixed(2)}` },
          ],
          url: '/finanzen/werbebudgets',
        });
        await supabase.from('ad_budgets').update({ alert_ueberschritten_sent_at: new Date().toISOString(), alert: true }).eq('id', budget.id);
      }

      if (remaining > 0 && remaining <= 200 && !budget.alert_200_sent_at && !budget.invoice_ticket_created) {
        await sendSlackMessage({
          title: `🟠 Rechnung erstellen: ${budget.werbeaccount_name}`,
          emoji: '💶',
          color: 'orange',
          message: `Nur noch *€${remaining.toFixed(2)}* übrig! Bitte Rechnung für *${budget.name}* erstellen.`,
          fields: [
            { label: 'Kunde', value: budget.name },
            { label: 'Remaining', value: `€${remaining.toFixed(2)}` },
            { label: 'Budget', value: `€${budget.werbebudget}` },
          ],
          url: '/finanzen/rechnungen',
        });
        await supabase.from('ad_budgets').update({ alert_200_sent_at: new Date().toISOString() }).eq('id', budget.id);
      }
    }
  };

  const togglePause = async (id: string, current: boolean) => {
    await supabase.from('ad_budgets').update({ pausiert: !current }).eq('id', id);
    setBudgets(prev => prev.map(b => b.id === id ? { ...b, pausiert: !current } : b));
    toast({ title: !current ? 'Account pausiert' : 'Account aktiviert' });
  };

  const filtered = useMemo(() => {
    let items = budgets;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(b => b.werbeaccount_name.toLowerCase().includes(q) || b.name.toLowerCase().includes(q) || (b.account_id || '').toLowerCase().includes(q));
    }
    switch (filter) {
      case 'aktiv': items = items.filter(b => !b.pausiert && b.ausgegeben <= b.werbebudget); break;
      case 'ueberschritten': items = items.filter(b => b.ausgegeben > b.werbebudget); break;
      case 'warnung': items = items.filter(b => b.remaining > 0 && b.remaining <= 200); break;
      case 'pausiert': items = items.filter(b => b.pausiert); break;
      case 'fixes': items = items.filter(b => b.fixes_budget); break;
    }
    switch (sortBy) {
      case 'remaining': items = [...items].sort((a, b) => a.remaining - b.remaining); break;
      case 'budget': items = [...items].sort((a, b) => b.werbebudget - a.werbebudget); break;
      case 'ausgegeben': items = [...items].sort((a, b) => b.ausgegeben - a.ausgegeben); break;
      case 'name': items = [...items].sort((a, b) => a.werbeaccount_name.localeCompare(b.werbeaccount_name)); break;
    }
    return items;
  }, [budgets, search, filter, sortBy]);

  const totalBudget = budgets.filter(b => !b.pausiert).reduce((s, b) => s + Number(b.werbebudget), 0);
  const totalSpent = budgets.filter(b => !b.pausiert).reduce((s, b) => s + Number(b.ausgegeben), 0);
  const overBudgetCount = budgets.filter(b => b.ausgegeben > b.werbebudget).length;
  const overBudgetAmount = budgets.filter(b => b.ausgegeben > b.werbebudget).reduce((s, b) => s + Math.abs(Number(b.remaining)), 0);
  const warningCount = budgets.filter(b => b.remaining > 0 && b.remaining <= 200 && !b.pausiert).length;

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-32" /><Skeleton className="h-96" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">💰 Werbebudgets</h2>
          <p className="text-sm text-muted-foreground">Live-Tracking aller Kundenbudgets auf Meta Ads</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadBudgets} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Daten aktualisieren
        </Button>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Gesamt Budget" value={`€${totalBudget.toLocaleString('de-DE')}`} icon={DollarSign} subtitle={`${budgets.filter(b => !b.pausiert).length} Accounts`} />
        <StatCard title="Gesamt Ausgegeben" value={`€${totalSpent.toLocaleString('de-DE')}`} icon={DollarSign} subtitle={totalBudget > 0 ? `${((totalSpent / totalBudget) * 100).toFixed(0)}% vom Budget` : '–'} />
        <StatCard title="Überschritten" value={overBudgetCount} icon={AlertTriangle} subtitle={overBudgetCount > 0 ? `€${overBudgetAmount.toLocaleString('de-DE')} über Budget` : 'Keine'} />
        <StatCard title="Warnung (< €200)" value={warningCount} icon={TrendingDown} subtitle="Rechnung bald fällig" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Kunde oder Account suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(FILTER_LABELS) as FilterType[]).map(f => (
            <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)} className="text-xs h-8">
              {FILTER_LABELS[f]}
            </Button>
          ))}
        </div>
      </div>

      {/* Budget Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead>Account / Kunde</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortBy('budget')}>Budget {sortBy === 'budget' && '↓'}</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortBy('ausgegeben')}>Ausgegeben {sortBy === 'ausgegeben' && '↓'}</TableHead>
                  <TableHead className="cursor-pointer hover:text-foreground" onClick={() => setSortBy('remaining')}>Remaining {sortBy === 'remaining' && '↓'}</TableHead>
                  <TableHead>Laufzeit</TableHead>
                  <TableHead className="w-20">Pausiert</TableHead>
                  <TableHead className="w-24">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(b => {
                  const status = getStatus(b);
                  const pct = pctUsed(b);
                  const isOver = b.ausgegeben > b.werbebudget;
                  return (
                    <TableRow
                      key={b.id}
                      className={
                        isOver ? 'bg-destructive/[0.04] border-l-[3px] border-l-destructive' :
                        (b.remaining > 0 && b.remaining <= 200) ? 'bg-orange-500/[0.04] border-l-[3px] border-l-orange-500' :
                        ''
                      }
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${status.dot}`} />
                          <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-medium text-sm">{b.werbeaccount_name}</p>
                          <p className="text-xs text-muted-foreground">{b.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{b.account_id}</p>
                          {b.fixes_budget && <Badge variant="outline" className="text-[10px] h-4 px-1">Fix</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">€{Number(b.werbebudget).toLocaleString('de-DE')}</p>
                        <p className="text-xs text-muted-foreground">{b.laufzeit || '–'}</p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">€{Number(b.ausgegeben).toLocaleString('de-DE')}</p>
                        <Progress value={Math.min(100, pct)} className={`h-1.5 mt-1 ${progressColor(pct)}`} />
                        <p className="text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(0)}%</p>
                      </TableCell>
                      <TableCell>
                        <p className={`font-medium ${isOver ? 'text-destructive' : b.remaining <= 200 ? 'text-orange-500' : 'text-emerald-500'}`}>
                          {isOver ? `-€${Math.abs(Number(b.remaining)).toLocaleString('de-DE')}` : `€${Number(b.remaining).toLocaleString('de-DE')}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{b.laufzeit || '–'}</TableCell>
                      <TableCell>
                        <Switch checked={b.pausiert} onCheckedChange={() => togglePause(b.id, b.pausiert)} disabled={!isAdminOrManager} />
                      </TableCell>
                      <TableCell>
                        {b.account_id && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => window.open(`https://business.facebook.com/adsmanager/manage/campaigns?act=${b.account_id?.replace('act_', '')}`, '_blank')}>
                            <ExternalLink className="h-3 w-3" /> Meta
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Keine Budgets gefunden</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
