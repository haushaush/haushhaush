import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Play, Square, X, Pencil } from 'lucide-react';
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
  };

  const handleDiscard = async () => {
    if (!timer.entryId) return;
    if (!confirm('Eintrag verwerfen?')) return;
    await supabase.from('time_entries').delete().eq('id', timer.entryId);
    setTimer({ running: false, startedAt: null, elapsed: 0, entryId: null, taskLabel: '' });
    toast('Eintrag verworfen');
  };

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col justify-between h-[200px] min-h-[200px] max-h-[200px] overflow-hidden p-5 gap-3">
      {/* Row 1 — Label */}
      <span className="text-[13px] font-semibold text-muted-foreground shrink-0 text-center" style={{ letterSpacing: '0.02em' }}>Zeiterfassung</span>

      {/* Row 2 — Timer display */}
      <div className="flex items-center justify-center shrink-0">
        <span
          className={`text-[40px] font-bold tracking-wide transition-colors ${
            timer.running ? 'text-primary animate-pulse' : 'text-foreground'
          }`}
          style={{ fontFamily: "'Sora', -apple-system, sans-serif", fontVariantNumeric: 'tabular-nums' }}
        >
          {formatTimer(timer.elapsed)}
        </span>
      </div>

      {/* Row 3 — Task input */}
      <div className="shrink-0">
        {timer.running ? (
          <div className="flex items-center gap-2 h-11 rounded-lg bg-background border border-border px-3.5 opacity-60">
            <Pencil className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-[14px] text-muted-foreground truncate">
              {timer.taskLabel || 'Keine Aufgabe'}
            </span>
          </div>
        ) : (
          <div className="relative">
            <Pencil className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              value={timer.taskLabel}
              onChange={e => setTimer(prev => ({ ...prev, taskLabel: e.target.value }))}
              placeholder="Woran arbeitest du?"
              className="w-full h-11 rounded-lg bg-background border border-border pl-8 pr-3.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-[3px] focus:ring-primary/12 focus:outline-none transition-all"
            />
          </div>
        )}
      </div>

      {/* Row 4 — Action buttons */}
      <div className="shrink-0">
        {!timer.running ? (
          <Button onClick={handleStart} className="w-full h-9 gap-2 rounded-lg">
            <Play className="h-4 w-4" /> Starten
          </Button>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              onClick={handleStop}
              variant="outline"
              className="h-9 gap-1.5 text-[13px] rounded-lg border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
            >
              <Square className="h-3.5 w-3.5" /> Stopp
            </Button>
            <Button
              onClick={handleDiscard}
              variant="ghost"
              className="h-9 w-9 p-0 rounded-lg text-muted-foreground border border-border"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* TODO: Time tracking logs — will be connected in Zeiterfassung section */}
    </div>
  );
}
