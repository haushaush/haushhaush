import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Play, Square, X } from 'lucide-react';
import { toast } from 'sonner';

interface TimerState {
  running: boolean;
  startedAt: string | null;
  elapsed: number;
  entryId: string | null;
  taskLabel: string;
}

function loadTimerState(): TimerState {
  try {
    const s = localStorage.getItem('timer-state');
    if (s) return JSON.parse(s);
  } catch {}
  return { running: false, startedAt: null, elapsed: 0, entryId: null, taskLabel: '' };
}

function saveTimerState(s: TimerState) {
  localStorage.setItem('timer-state', JSON.stringify(s));
}

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function TimeTracker() {
  const { user } = useAuth();
  const [timer, setTimer] = useState<TimerState>(loadTimerState);
  const [todayTotal, setTodayTotal] = useState(0);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);

  // Fetch today's total
  const fetchToday = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('time_entries')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .gte('started_at', `${today}T00:00:00`)
      .not('duration_seconds', 'is', null);
    const total = (data || []).reduce((s: number, e: any) => s + (e.duration_seconds || 0), 0);
    setTodayTotal(total);
  }, [user?.id]);

  // Fetch recent entries
  const fetchRecent = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('time_entries')
      .select('task_label, duration_seconds')
      .eq('user_id', user.id)
      .gte('started_at', `${today}T00:00:00`)
      .not('duration_seconds', 'is', null)
      .order('started_at', { ascending: false })
      .limit(3);
    setRecentEntries(data || []);
  }, [user?.id]);

  useEffect(() => {
    fetchToday();
    fetchRecent();
  }, [fetchToday, fetchRecent]);

  // Timer tick
  useEffect(() => {
    if (!timer.running || !timer.startedAt) return;
    const tick = () => {
      const elapsed = Math.round((Date.now() - new Date(timer.startedAt!).getTime()) / 1000);
      setTimer(prev => ({ ...prev, elapsed }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timer.running, timer.startedAt]);

  // Persist state
  useEffect(() => { saveTimerState(timer); }, [timer]);

  const handleStart = async () => {
    if (!user?.id) return;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('time_entries')
      .insert({ user_id: user.id, task_label: timer.taskLabel || null, started_at: now })
      .select('id')
      .single();
    if (error || !data) {
      toast.error('Timer konnte nicht gestartet werden');
      return;
    }
    setTimer({ running: true, startedAt: now, elapsed: 0, entryId: data.id, taskLabel: timer.taskLabel });
  };

  const handleStop = async () => {
    if (!timer.entryId) return;
    const duration = Math.round((Date.now() - new Date(timer.startedAt!).getTime()) / 1000);
    await supabase
      .from('time_entries')
      .update({ stopped_at: new Date().toISOString(), duration_seconds: duration })
      .eq('id', timer.entryId);
    toast.success(`Zeit gestoppt: ${formatDuration(duration)}`);
    setTimer({ running: false, startedAt: null, elapsed: 0, entryId: null, taskLabel: '' });
    fetchToday();
    fetchRecent();
  };

  const handleDiscard = async () => {
    if (!timer.entryId) return;
    if (!confirm('Eintrag verwerfen?')) return;
    await supabase.from('time_entries').delete().eq('id', timer.entryId);
    setTimer({ running: false, startedAt: null, elapsed: 0, entryId: null, taskLabel: '' });
    toast('Eintrag verworfen');
  };

  const todayH = Math.floor(todayTotal / 3600);
  const todayM = Math.floor((todayTotal % 3600) / 60);

  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col justify-between h-full">
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-semibold text-foreground">Zeiterfassung</span>
        <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {todayH}h {todayM}m heute
        </span>
      </div>

      {/* Timer display */}
      <div className="flex items-center justify-center py-3">
        <span
          className={`font-mono text-[32px] font-bold tracking-wider transition-colors ${
            timer.running ? 'text-primary animate-pulse' : 'text-foreground'
          }`}
        >
          {formatTimer(timer.elapsed)}
        </span>
      </div>

      {/* Task input */}
      <div className="mb-3">
        {timer.running ? (
          <p className="text-[13px] text-muted-foreground truncate border-b border-border pb-1.5">
            {timer.taskLabel || 'Keine Aufgabe'}
          </p>
        ) : (
          <Input
            value={timer.taskLabel}
            onChange={e => setTimer(prev => ({ ...prev, taskLabel: e.target.value }))}
            placeholder="Was arbeitest du gerade an?"
            className="text-[13px] border-0 border-b border-border rounded-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-8"
          />
        )}
      </div>

      {/* Action buttons */}
      {!timer.running ? (
        <Button onClick={handleStart} className="w-full h-10 gap-2">
          <Play className="h-4 w-4" /> Starten
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={handleStop}
            variant="destructive"
            className="h-10 gap-1.5 text-[13px]"
          >
            <Square className="h-3.5 w-3.5" /> Stopp
          </Button>
          <Button
            onClick={handleDiscard}
            variant="ghost"
            className="h-10 gap-1.5 text-[13px] text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" /> Verwerfen
          </Button>
        </div>
      )}

      {/* Recent entries */}
      {recentEntries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          {recentEntries.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate mr-2">{e.task_label || 'Ohne Titel'}</span>
              <span className="shrink-0">{formatDuration(e.duration_seconds || 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
