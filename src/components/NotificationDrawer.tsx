import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Bell, Mail, Hash, CheckSquare, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from '@/hooks/use-mobile';
import { type Notification, type NotificationChannel } from '@/hooks/useNotifications';

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  loading: boolean;
  unreadByChannel: (ch: NotificationChannel) => number;
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
}

const CHANNEL_TABS: { key: NotificationChannel | 'alle'; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'intern', label: 'Intern' },
  { key: 'email', label: 'E-Mail' },
  { key: 'slack', label: 'Slack' },
  { key: 'system', label: 'System' },
];

function getChannelIcon(channel: NotificationChannel) {
  switch (channel) {
    case 'intern': return <Bell className="h-3.5 w-3.5 text-primary-foreground" />;
    case 'email': return <Mail className="h-3.5 w-3.5 text-white" />;
    case 'slack': return <Hash className="h-3.5 w-3.5 text-white" />;
    case 'aufgabe': return <CheckSquare className="h-3.5 w-3.5 text-white" />;
    case 'system': return <Info className="h-3.5 w-3.5 text-white" />;
    default: return <Bell className="h-3.5 w-3.5 text-white" />;
  }
}

function getChannelBg(channel: NotificationChannel) {
  switch (channel) {
    case 'intern': return 'bg-primary';
    case 'email': return 'bg-blue-500';
    case 'slack': return 'bg-purple-500';
    case 'aufgabe': return 'bg-orange-500';
    case 'system': return 'bg-muted-foreground';
    default: return 'bg-muted-foreground';
  }
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Gerade eben';
  if (mins < 60) return `vor ${mins} Min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function groupNotifications(items: Notification[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Notification[] }[] = [
    { label: 'HEUTE', items: [] },
    { label: 'GESTERN', items: [] },
    { label: 'DIESE WOCHE', items: [] },
    { label: 'ÄLTER', items: [] },
  ];

  items.forEach(n => {
    const d = new Date(n.created_at);
    if (d >= today) groups[0].items.push(n);
    else if (d >= yesterday) groups[1].items.push(n);
    else if (d >= weekAgo) groups[2].items.push(n);
    else groups[3].items.push(n);
  });

  return groups.filter(g => g.items.length > 0);
}

export function NotificationDrawer({
  open,
  onClose,
  notifications,
  loading,
  unreadByChannel,
  onMarkAsRead,
  onMarkAllAsRead,
}: NotificationDrawerProps) {
  const [activeTab, setActiveTab] = useState<NotificationChannel | 'alle'>('alle');
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  if (!open) return null;

  const filtered = activeTab === 'alle'
    ? notifications
    : notifications.filter(n => n.channel === activeTab);

  const groups = groupNotifications(filtered);

  const handleItemClick = (n: Notification) => {
    onMarkAsRead(n.id);
    if (n.action_url) {
      navigate(n.action_url);
      onClose();
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 md:bg-transparent"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Benachrichtigungen"
        className={`fixed top-0 right-0 z-50 h-full bg-card border-l border-border shadow-xl
          flex flex-col transition-transform duration-250 ease-out
          ${isMobile ? 'w-full' : 'w-[420px]'}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Benachrichtigungen</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={onMarkAllAsRead}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Alle gelesen
            </button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8" aria-label="Schließen">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
          {CHANNEL_TABS.map(tab => {
            const count = tab.key === 'alle'
              ? notifications.filter(n => !n.read).length
              : unreadByChannel(tab.key as NotificationChannel);
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors
                  ${isActive
                    ? 'text-primary border-b-2 border-primary bg-primary/5'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }
                `}
              >
                {tab.label}
                {count > 0 && (
                  <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground">
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-4 space-y-3" aria-busy="true">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-2.5 bg-muted rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Keine Benachrichtigungen</p>
            </div>
          ) : (
            <div className="py-2">
              {groups.map(group => (
                <div key={group.label}>
                  <p className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map(n => (
                    <button
                      key={n.id}
                      onClick={() => handleItemClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all duration-300
                        hover:bg-muted/50 group
                        ${n.read ? 'opacity-60' : ''}
                      `}
                    >
                      {/* Channel icon */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getChannelBg(n.channel)}`}>
                        {getChannelIcon(n.channel)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] leading-tight text-foreground truncate ${!n.read ? 'font-semibold' : 'font-medium'}`}>
                          {n.title}
                        </p>
                        {n.preview && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.preview}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70 mt-1">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>

                      {/* Unread dot */}
                      {!n.read && (
                        <div className="flex-shrink-0 mt-1.5">
                          <div className="w-2 h-2 rounded-full bg-primary" aria-label="Ungelesen" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}
