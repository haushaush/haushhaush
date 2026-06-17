import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Sun, Moon, Star, Battery, Target, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Row = {
  id: string; user_id: string; team_member_id: string | null; date: string; type: 'checkin' | 'checkout';
  ziele: any[]; focus_task: string | null; zusagen: any[]; energie_morgen: number | null; vorfreude: string | null;
  ziele_abend: any[]; zusagen_abend: any[]; energie_abend: number | null; learnings: string | null;
  tagesbewertung: number | null; notiz: string | null;
};

export default function CheckinOverview() {
  const [team, setTeam] = useState<any[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [filterUser, setFilterUser] = useState<string>('all');
  const [drilldownUser, setDrilldownUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(); since.setDate(since.getDate() - 14);
      const [t, today, hist] = await Promise.all([
        supabase.from('team').select('id, name, email, department').order('name'),
        supabase.from('daily_checkins').select('*').eq('date', selectedDate),
        supabase.from('daily_checkins').select('*').gte('date', isoDate(since)).order('date', { ascending: true }),
      ]);
      setTeam(t.data || []);
      setRows((today.data as any) || []);
      setHistory((hist.data as any) || []);
      setLoading(false);
    })();
  }, [selectedDate]);

  const byUser = useMemo(() => {
    const m = new Map<string, { checkin?: Row; checkout?: Row }>();
    for (const r of rows) {
      const entry = m.get(r.user_id) || {};
      entry[r.type] = r;
      m.set(r.user_id, entry);
    }
    return m;
  }, [rows]);

  const totalTeam = team.length || 1;
  const checkedIn = Array.from(byUser.values()).filter(v => v.checkin).length;
  const checkedOut = Array.from(byUser.values()).filter(v => v.checkout).length;
  const avgEnergie = (() => {
    const xs = rows.filter(r => r.type === 'checkin' && r.energie_morgen).map(r => r.energie_morgen as number);
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–';
  })();
  const avgBewertung = (() => {
    const xs = rows.filter(r => r.type === 'checkout' && r.tagesbewertung).map(r => r.tagesbewertung as number);
    return xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–';
  })();

  // Chart: energy per user over time
  const energyChart = useMemo(() => {
    const dates = Array.from(new Set(history.map(r => r.date))).sort();
    return dates.map(d => {
      const row: any = { date: d.slice(5) };
      for (const m of team) {
        const r = history.find(h => h.date === d && h.user_id === m.id && h.type === 'checkin');
        if (r?.energie_morgen) row[m.name] = r.energie_morgen;
      }
      return row;
    });
  }, [history, team]);

  // Chart: avg completion rate per day
  const completionChart = useMemo(() => {
    const dates = Array.from(new Set(history.filter(r => r.type === 'checkout').map(r => r.date))).sort();
    return dates.map(d => {
      const dayRows = history.filter(h => h.date === d && h.type === 'checkout');
      const rates = dayRows.map(r => {
        const z: any[] = (r.ziele_abend as any[]) || [];
        if (!z.length) return null;
        const done = z.filter(x => x.status === 'done' || x.done).length;
        return (done / z.length) * 100;
      }).filter((x): x is number => x !== null);
      return { date: d.slice(5), rate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0 };
    });
  }, [history]);

  const filteredTeam = filterUser === 'all' ? team : team.filter(m => m.id === filterUser);

  const drilldownData = drilldownUser ? history.filter(h => h.user_id === drilldownUser) : [];
  const drilldownMember = team.find(m => m.id === drilldownUser);

  return (
    <div className="p-4 md:p-6 lg:p-10 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Check-in & Check-out</h1>
          <p className="text-sm text-muted-foreground">Tägliche Reflexion deines Teams.</p>
        </div>
        <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-auto" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Sun className="h-4 w-4" />} label="Eingecheckt heute" value={`${checkedIn} / ${totalTeam}`} accent="emerald" />
        <KpiCard icon={<Moon className="h-4 w-4" />} label="Ausgecheckt heute" value={`${checkedOut} / ${totalTeam}`} accent="primary" />
        <KpiCard icon={<Battery className="h-4 w-4" />} label="Ø Energie Morgen" value={`${avgEnergie} / 10`} accent="amber" />
        <KpiCard icon={<Star className="h-4 w-4" />} label="Ø Tagesbewertung" value={`${avgBewertung} / 5`} accent="amber" />
      </div>

      {/* Team table */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Team — heute</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mitarbeiter</TableHead>
                  <TableHead className="text-center">Check-in</TableHead>
                  <TableHead className="text-center">Check-out</TableHead>
                  <TableHead className="text-center">Energie M</TableHead>
                  <TableHead className="text-center">Energie A</TableHead>
                  <TableHead className="text-center">Bewertung</TableHead>
                  <TableHead>Focus Task</TableHead>
                  <TableHead className="text-right">Erledigung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map(m => {
                  const data = byUser.get(m.id) || {};
                  const ci = data.checkin; const co = data.checkout;
                  const ziele = (co?.ziele_abend as any[]) || [];
                  const done = ziele.filter(z => z.status === 'done' || z.done).length;
                  const rate = ziele.length ? Math.round((done / ziele.length) * 100) : null;
                  return (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => setDrilldownUser(m.id)}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-center">{ci ? <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" /> : <XCircle className="h-4 w-4 text-muted-foreground/40 inline" />}</TableCell>
                      <TableCell className="text-center">{co ? <CheckCircle2 className="h-4 w-4 text-emerald-500 inline" /> : <XCircle className="h-4 w-4 text-muted-foreground/40 inline" />}</TableCell>
                      <TableCell className="text-center tabular-nums">{ci?.energie_morgen ?? '–'}</TableCell>
                      <TableCell className="text-center tabular-nums">{co?.energie_abend ?? '–'}</TableCell>
                      <TableCell className="text-center tabular-nums">{co?.tagesbewertung ? `${co.tagesbewertung}⭐` : '–'}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{ci?.focus_task || '–'}</TableCell>
                      <TableCell className="text-right tabular-nums">{rate !== null ? `${rate}%` : '–'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Energie Verlauf (14 Tage)</CardTitle>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-[180px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Mitarbeiter</SelectItem>
                {team.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={energyChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={[0, 10]} fontSize={11} />
                <Tooltip />
                {filteredTeam.map((m, i) => (
                  <Line key={m.id} type="monotone" dataKey={m.name} stroke={`hsl(${(i * 47) % 360}, 70%, 50%)`} dot={false} strokeWidth={2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Ø Erledigungsrate Team</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={completionChart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} unit="%" />
                <Tooltip />
                <Line type="monotone" dataKey="rate" stroke="hsl(174 80% 45%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Drill-down */}
      <Sheet open={!!drilldownUser} onOpenChange={o => !o && setDrilldownUser(null)}>
        <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
          <SheetHeader><SheetTitle>{drilldownMember?.name}</SheetTitle></SheetHeader>
          {(() => {
            const today = drilldownData.filter(r => r.date === selectedDate);
            const ci = today.find(r => r.type === 'checkin');
            const co = today.find(r => r.type === 'checkout');
            const userHistory = drilldownData;
            const avgE = (() => {
              const xs = userHistory.filter(r => r.type === 'checkin' && r.energie_morgen).map(r => r.energie_morgen as number);
              return xs.length ? (xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(1) : '–';
            })();
            const avgB = (() => {
              const xs = userHistory.filter(r => r.type === 'checkout' && r.tagesbewertung).map(r => r.tagesbewertung as number);
              return xs.length ? (xs.reduce((a,b)=>a+b,0)/xs.length).toFixed(1) : '–';
            })();
            const focusTasks = userHistory.filter(r => r.focus_task).map(r => r.focus_task as string);
            const userEnergy = userHistory.filter(r => r.type === 'checkin' && r.energie_morgen).map(r => ({ date: r.date.slice(5), e: r.energie_morgen }));
            return (
              <div className="space-y-5 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Ø Energie" value={`${avgE}/10`} />
                  <MiniStat label="Ø Tagesbewertung" value={`${avgB}/5`} />
                </div>
                <div className="h-40">
                  <ResponsiveContainer><LineChart data={userEnergy}><XAxis dataKey="date" fontSize={10}/><YAxis domain={[0,10]} fontSize={10}/><Line type="monotone" dataKey="e" stroke="hsl(174 80% 45%)" strokeWidth={2}/><Tooltip/></LineChart></ResponsiveContainer>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Check-in am {selectedDate}</p>
                  {ci ? (
                    <div className="space-y-2 text-sm border border-border rounded-lg p-3">
                      <div><span className="text-muted-foreground">Focus: </span>{ci.focus_task || '–'}</div>
                      <div><span className="text-muted-foreground">Energie: </span>{ci.energie_morgen}/10</div>
                      <div><span className="text-muted-foreground">Vorfreude: </span>{ci.vorfreude || '–'}</div>
                      {!!(ci.ziele as any[])?.length && <div><span className="text-muted-foreground">Ziele:</span><ul className="ml-4 list-disc">{(ci.ziele as any[]).map((z, i) => <li key={i}>{z.text}</li>)}</ul></div>}
                    </div>
                  ) : <p className="text-sm text-muted-foreground italic">Kein Check-in.</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Check-out am {selectedDate}</p>
                  {co ? (
                    <div className="space-y-2 text-sm border border-border rounded-lg p-3">
                      <div><span className="text-muted-foreground">Bewertung: </span>{co.tagesbewertung}/5 ⭐</div>
                      <div><span className="text-muted-foreground">Energie: </span>{co.energie_abend}/10</div>
                      <div><span className="text-muted-foreground">Learnings: </span>{co.learnings || '–'}</div>
                      <div><span className="text-muted-foreground">Notiz: </span>{co.notiz || '–'}</div>
                    </div>
                  ) : <p className="text-sm text-muted-foreground italic">Kein Check-out.</p>}
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Häufige Focus Tasks</p>
                  <div className="flex flex-wrap gap-1.5">
                    {focusTasks.slice(0, 20).map((t, i) => <Badge key={i} variant="outline" className="text-[11px]">{t}</Badge>)}
                    {!focusTasks.length && <p className="text-sm text-muted-foreground italic">Noch keine.</p>}
                  </div>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: 'emerald'|'primary'|'amber' }) {
  const accents = {
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('h-7 w-7 rounded-md flex items-center justify-center', accents[accent])}>{icon}</div>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
