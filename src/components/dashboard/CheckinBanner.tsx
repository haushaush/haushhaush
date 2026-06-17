import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { Sun, Moon, ArrowRight } from 'lucide-react';

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function CheckinBanner() {
  const { user, isTestMode, hasRole } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const isAdmin = hasRole?.('admin');

  useEffect(() => {
    if (!user || isTestMode) return;
    (async () => {
      const { data } = await supabase
        .from('daily_checkins').select('type')
        .eq('user_id', user.id).eq('date', todayISO());
      setRows(data || []);
    })();
  }, [user?.id, isTestMode]);

  if (!user || isTestMode || isAdmin || !rows) return null;

  const hour = new Date().getHours();
  const hasCheckin = rows.some(r => r.type === 'checkin');
  const hasCheckout = rows.some(r => r.type === 'checkout');
  const firstName = profile?.name?.split(' ')[0] || '';

  if (!hasCheckin) {
    return (
      <button onClick={() => navigate('/funnel')}
        className="w-full mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition text-left group">
        <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center"><Sun className="h-4 w-4 text-primary" /></div>
        <div className="flex-1">
          <p className="text-sm font-medium">Guten Morgen{firstName ? `, ${firstName}` : ''}! Dein Check-in fehlt noch.</p>
          <p className="text-xs text-muted-foreground">Setz dir 3 Ziele für heute — dauert 2 Minuten.</p>
        </div>
        <span className="text-xs text-primary flex items-center gap-1 group-hover:gap-2 transition-all">Jetzt starten <ArrowRight className="h-3.5 w-3.5" /></span>
      </button>
    );
  }

  if (hasCheckin && !hasCheckout && hour >= 16) {
    return (
      <button onClick={() => navigate('/funnel')}
        className="w-full mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition text-left group">
        <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><Moon className="h-4 w-4 text-amber-600 dark:text-amber-400" /></div>
        <div className="flex-1">
          <p className="text-sm font-medium">Vergiss deinen Check-out nicht!</p>
          <p className="text-xs text-muted-foreground">Reflektiere kurz deinen Tag.</p>
        </div>
        <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 group-hover:gap-2 transition-all">Jetzt ausfüllen <ArrowRight className="h-3.5 w-3.5" /></span>
      </button>
    );
  }

  return null;
}
