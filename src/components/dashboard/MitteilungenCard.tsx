import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Mail, MessageSquare, CheckSquare, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface NotifRow {
  id: string;
  channel: string;
  title: string;
  preview: string | null;
  sender_name: string | null;
  read: boolean;
  created_at: string;
  tag: string | null;
  action_url: string | null;
}

const relativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min`;
  if (hours < 24) return `vor ${hours} Std`;
  if (days === 1) return 'Gestern';
  return `vor ${days} Tagen`;
};

const channelConfig: Record<string, { icon: typeof Bell; bg: string; color: string; label: string }> = {
  slack: { icon: MessageSquare, bg: 'rgba(10,147,150,0.1)', color: 'hsl(var(--primary))', label: 'Slack' },
  email: { icon: Mail, bg: 'rgba(59,130,246,0.1)', color: '#3b82f6', label: 'E-Mail' },
  intern: { icon: Bell, bg: 'rgba(10,147,150,0.1)', color: 'hsl(var(--primary))', label: 'Intern' },
  aufgabe: { icon: CheckSquare, bg: 'rgba(249,115,22,0.1)', color: '#f97316', label: 'Aufgabe' },
  system: { icon: Bell, bg: 'rgba(10,147,150,0.1)', color: 'hsl(var(--primary))', label: 'System' },
};

export function MitteilungenCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotifRow[]>([]);
  const [, setTick] = useState(0);

  const fetchNotifs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, channel, title, preview, sender_name, read, created_at, tag, action_url')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('created_at', { ascending: false })
      .limit(5);
    setNotifications((data as NotifRow[]) || []);
  }, [user]);

  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`notifications-home-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () => fetchNotifs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchNotifs]);

  // Tick every 60s for relative time
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(i);
  }, []);

  const handleClick = async (n: NotifRow) => {
    if (!n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      await supabase.from('notifications').update({ read: true } as any).eq('id', n.id);
    }
    navigate(n.action_url || '/nachrichten');
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="w-full rounded-[14px] border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-[18px] py-[14px]">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-[13px] font-semibold text-foreground">Neueste Mitteilungen</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold text-primary-foreground bg-primary rounded-[10px] px-[7px] py-[1px]">
              {unreadCount} neu
            </span>
          )}
        </div>
        <button
          onClick={() => navigate('/nachrichten')}
          className="text-[12px] text-primary hover:underline cursor-pointer flex items-center gap-1 bg-transparent border-none"
        >
          Alle ansehen <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="h-px bg-border" />

      {/* List */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Bell className="h-6 w-6 text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">Keine neuen Mitteilungen</span>
        </div>
      ) : (
        notifications.map((n, i) => {
          const cfg = channelConfig[n.channel] || channelConfig.intern;
          const Icon = cfg.icon;
          return (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              className="flex items-start gap-3 px-[18px] py-3 cursor-pointer transition-colors duration-150 hover:bg-muted/50"
              style={{ borderBottom: i < notifications.length - 1 ? '1px solid hsl(var(--border))' : undefined }}
            >
              {/* Channel icon */}
              <div
                className="flex-shrink-0 flex items-center justify-center rounded-full"
                style={{ width: 28, height: 28, background: cfg.bg }}
              >
                <Icon style={{ width: 14, height: 14, color: cfg.color }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[12px] font-semibold text-foreground truncate">
                    {n.sender_name || n.title}
                  </span>
                  {n.tag && (
                    <span className="text-[10px] text-muted-foreground"> · #{n.tag}</span>
                  )}
                </div>
                <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                  {n.preview || n.title}
                </p>
              </div>

              {/* Right */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {relativeTime(n.created_at)}
                </span>
                {!n.read && (
                  <div className="w-[6px] h-[6px] rounded-full bg-primary" />
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
