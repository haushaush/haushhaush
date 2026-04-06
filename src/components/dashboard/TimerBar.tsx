import { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
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

export function TimerBar() {
  const [timer, setTimer] = useState<TimerState>(loadTimerState);
  const [elapsed, setElapsed] = useState(0);
  const isMobile = useIsMobile();

  // Try to get sidebar state, fallback gracefully
  let sidebarState: string = 'expanded';
  try {
    const sidebar = useSidebar();
    sidebarState = sidebar.state;
  } catch {
    // Not inside SidebarProvider, use default
  }

  const collapsed = sidebarState === 'collapsed';

  // Listen for localStorage changes from other components
  useEffect(() => {
    const check = () => {
      const state = loadTimerState();
      setTimer(state);
    };
    check();
    const interval = setInterval(check, 1000);
    window.addEventListener('storage', check);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', check);
    };
  }, []);

  // Tick elapsed
  useEffect(() => {
    if (!timer.running || !timer.startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - new Date(timer.startedAt!).getTime()) / 1000));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [timer.running, timer.startedAt]);

  const handleStop = async () => {
    if (!timer.entryId || !timer.startedAt) return;
    const duration = Math.round((Date.now() - new Date(timer.startedAt).getTime()) / 1000);
    await supabase
      .from('time_entries')
      .update({ stopped_at: new Date().toISOString(), duration_seconds: duration })
      .eq('id', timer.entryId);
    const newState: TimerState = { running: false, startedAt: null, elapsed: 0, entryId: null, taskLabel: '' };
    localStorage.setItem('timer-state', JSON.stringify(newState));
    setTimer(newState);
    toast.success(`Zeit gestoppt: ${formatDuration(duration)}`);
  };

  const handleDiscard = async () => {
    if (!timer.entryId) return;
    if (!confirm('Eintrag verwerfen?')) return;
    await supabase.from('time_entries').delete().eq('id', timer.entryId);
    const newState: TimerState = { running: false, startedAt: null, elapsed: 0, entryId: null, taskLabel: '' };
    localStorage.setItem('timer-state', JSON.stringify(newState));
    setTimer(newState);
    toast('Eintrag verworfen');
  };

  if (!timer.running) return null;

  const leftOffset = isMobile ? '0px' : collapsed ? 'var(--sidebar-width-icon, 48px)' : 'var(--sidebar-width, 256px)';

  return (
    <div
      className="fixed top-0 z-[100] flex items-center gap-4 px-5"
      style={{
        left: leftOffset,
        right: 0,
        height: '44px',
        background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.85))',
        color: 'white',
        boxShadow: '0 2px 8px hsl(var(--primary) / 0.3)',
      }}
    >
      <Clock className="h-3.5 w-3.5 opacity-80 shrink-0" />

      <span className="font-mono text-[15px] font-bold tracking-wider">
        {formatTimer(elapsed)}
      </span>

      <div className="h-5 w-px bg-white/30 shrink-0" />

      {!isMobile && (
        <span className="text-[13px] opacity-90 truncate max-w-[300px]">
          {timer.taskLabel || 'Zeiterfassung läuft...'}
        </span>
      )}

      <div className="flex-1" />

      <button
        onClick={handleStop}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors"
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
      >
        ⏸ Stopp
      </button>

      <button
        onClick={handleDiscard}
        className="h-6 w-6 flex items-center justify-center rounded opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Verwerfen"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
