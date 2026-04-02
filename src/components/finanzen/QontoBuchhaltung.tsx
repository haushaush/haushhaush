import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, ArrowRight, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { formatValue } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const PIE_COLORS = [
  'hsl(174, 90%, 31%)', 'hsl(174, 70%, 45%)', 'hsl(174, 50%, 55%)',
  'hsl(174, 30%, 65%)', 'hsl(215, 50%, 55%)', 'hsl(0, 0%, 65%)',
];

interface QontoTransaction {
  id: string;
  qonto_id: string;
  amount_cents: number | null;
  amount_currency: string;
  direction: string | null;
  label: string | null;
  reference: string | null;
  emitted_at: string | null;
  settled_at: string | null;
  status: string | null;
  category: string | null;
  counterparty_name: string | null;
}

interface IntegrationSetting {
  id: string;
  provider: string;
  connected: boolean;
  config: Record<string, any>;
  last_sync_at: string | null;
  last_sync_status: string | null;
}

export function QontoBuchhaltung() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [setting, setSetting] = useState<IntegrationSetting | null>(null);
  const [transactions, setTransactions] = useState<QontoTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('all');
  const [page, setPage] = useState(1);
  const perPage = 20;

  const fetchData = async () => {
    if (!user) { setLoading(false); return; }
    const [settingRes, txRes] = await Promise.all([
      supabase.from('integration_settings').select('*').eq('user_id', user.id).eq('provider', 'qonto').maybeSingle(),
      supabase.from('qonto_transactions').select('*').order('emitted_at', { ascending: false }).limit(500),
    ]);
    setSetting((settingRes.data as any) || null);
    setTransactions((txRes.data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const connected = setting?.connected === true;
  const config = setting?.config || {};
  const balanceCents = config.balance_cents || 0;
  const balance = balanceCents / 100;
  const iban = config.iban || '';
  const maskedIban = iban ? `${iban.slice(0, 4)} •••• •••• •••• •••• ${iban.slice(-4)}` : '–';

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Nicht angemeldet'); setSyncing(false); return; }
      
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/sync-qonto`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });
      const result = await res.json();
      if (result.error) {
        toast.error(`Sync fehlgeschlagen: ${result.error}`);
      } else {
        toast.success(`${result.transactions_synced} Transaktionen synchronisiert`);
        fetchData();
      }
    } catch (e: any) {
      toast.error('Sync fehlgeschlagen');
    }
    setSyncing(false);
  };

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      const matchSearch = !search || 
        (t.label || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.counterparty_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.reference || '').toLowerCase().includes(search.toLowerCase());
      const matchDir = dirFilter === 'all' || t.direction === dirFilter;
      return matchSearch && matchDir;
    });
  }, [transactions, search, dirFilter]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  // Category breakdown for current month
  const categoryData = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthTx = transactions.filter(t => t.direction === 'debit' && t.settled_at && t.settled_at >= startOfMonth);
    const map: Record<string, number> = {};
    monthTx.forEach(t => {
      const cat = t.category || 'Sonstiges';
      map[cat] = (map[cat] || 0) + Math.abs(t.amount_cents || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value: value / 100 })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const totalExpenses = categoryData.reduce((s, c) => s + c.value, 0);

  const exportCSV = () => {
    const rows = [['Datum', 'Empfänger', 'Verwendungszweck', 'Betrag', 'Richtung', 'Status'].join(';')];
    filtered.forEach(t => {
      const amt = ((t.amount_cents || 0) / 100);
      const sign = t.direction === 'debit' ? '-' : '+';
      rows.push([
        t.emitted_at ? new Date(t.emitted_at).toLocaleDateString('de-DE') : '–',
        t.counterparty_name || '–',
        t.reference || t.label || '–',
        `${sign}${amt.toLocaleString('de-DE', { minimumFractionDigits: 2 })}`,
        t.direction === 'credit' ? 'Eingang' : 'Ausgang',
        t.status || '–',
      ].join(';'));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qonto_transaktionen_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-4 mt-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // Not connected CTA
  if (!connected) {
    return (
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Qonto — Geschäftskonto</h3>
        <Card className="border-[var(--border)]">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--color-teal-subtle)] flex items-center justify-center text-[var(--color-teal)] font-bold text-xl">Q</div>
            <p className="text-sm text-[var(--text-secondary)]">Qonto verbinden um Kontostand und Transaktionen zu sehen</p>
            <Button
              onClick={() => navigate('/einstellungen')}
              className="bg-[var(--color-teal)] hover:bg-[var(--color-teal-hover)] text-white"
            >
              Jetzt verbinden <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Qonto — Geschäftskonto</h3>
        <div className="flex items-center gap-2">
          <Badge className="bg-[var(--color-green-subtle)] text-[var(--color-green-text)] border-0 text-xs">
            Verbunden
            {setting?.last_sync_at && ` · Sync ${new Date(setting.last_sync_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
            Synchronisieren
          </Button>
        </div>
      </div>

      {/* A: Kontostand */}
      <Card className="border-[var(--border)]">
        <CardContent className="py-6">
          <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-medium mb-1">Aktueller Kontostand</p>
          <p className="text-3xl font-bold text-[var(--color-teal)]">{formatValue(balance, 'currency')}</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">{maskedIban}</p>
          {setting?.last_sync_at && (
            <p className="text-[11px] text-[var(--text-muted)] mt-2">
              Zuletzt aktualisiert: {new Date(setting.last_sync_at).toLocaleString('de-DE')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* B: Transaktionen */}
      <Card className="border-[var(--border)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Transaktionen</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5 mr-1" />CSV exportieren
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Suche..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-48"
            />
            <Select value={dirFilter} onValueChange={v => { setDirFilter(v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="credit">Einnahmen</SelectItem>
                <SelectItem value="debit">Ausgaben</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Empfänger/Sender</TableHead>
                  <TableHead className="hidden sm:table-cell">Verwendungszweck</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead className="hidden md:table-cell">Richtung</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-[var(--text-muted)]">
                      Keine Transaktionen gefunden
                    </TableCell>
                  </TableRow>
                ) : paginated.map(t => {
                  const amt = (t.amount_cents || 0) / 100;
                  const isCredit = t.direction === 'credit';
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-[var(--text-secondary)] text-sm">
                        {t.emitted_at ? new Date(t.emitted_at).toLocaleDateString('de-DE') : '–'}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{t.counterparty_name || t.label || '–'}</TableCell>
                      <TableCell className="hidden sm:table-cell text-[var(--text-muted)] text-sm truncate max-w-[200px]">
                        {t.reference || t.label || '–'}
                      </TableCell>
                      <TableCell className={`text-right font-medium text-sm ${isCredit ? 'text-[var(--color-green)]' : 'text-[var(--color-red)]'}`}>
                        {isCredit ? '+' : '-'}{formatValue(Math.abs(amt), 'currency')}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge className={`border-0 text-[10px] ${
                          isCredit
                            ? 'bg-[var(--color-green-subtle)] text-[var(--color-green-text)]'
                            : 'bg-[var(--color-red-subtle)] text-[var(--color-red-text)]'
                        }`}>
                          {isCredit ? 'Eingang' : 'Ausgang'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary" className="text-[10px]">
                          {t.status === 'completed' ? 'Abgeschlossen' : t.status || '–'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-[var(--text-muted)]">
                {filtered.length} Transaktionen · Seite {page}/{totalPages}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* C: Kategorien Monatsübersicht */}
      {categoryData.length > 0 && (
        <Card className="border-[var(--border)]">
          <CardHeader>
            <CardTitle className="text-base">Kategorien — {new Date().toLocaleString('de-DE', { month: 'long', year: 'numeric' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-[180px] h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-[var(--text-primary)]">{formatValue(totalExpenses, 'currency', true)}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">Ausgaben</span>
                </div>
              </div>
              <div className="flex-1 space-y-2">
                {categoryData.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-[var(--text-primary)]">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-[var(--text-primary)]">{formatValue(c.value, 'currency')}</span>
                      <span className="text-xs text-[var(--text-muted)] w-10 text-right">
                        {totalExpenses > 0 ? ((c.value / totalExpenses) * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
