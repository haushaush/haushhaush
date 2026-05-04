import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import EmailPage from '@/pages/Email';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Search, X, Bell, Mail, Hash, CheckSquare, Info, Archive, Eye, EyeOff, ArrowLeft, ExternalLink, ChevronRight,
} from 'lucide-react';

type NotificationChannel = 'intern' | 'email' | 'slack' | 'aufgabe' | 'system';

interface Notification {
  id: string;
  user_id: string;
  channel: string;
  title: string;
  preview: string | null;
  body: string | null;
  source_name: string | null;
  source_avatar_url: string | null;
  sender_name: string | null;
  sender_avatar: string | null;
  tag: string | null;
  read: boolean;
  archived: boolean;
  archived_at: string | null;
  action_url: string | null;
  external_id: string | null;
  external_thread_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  reply_to_id: string | null;
}

type TabKey = 'alle' | 'ungelesen' | 'slack' | 'email' | 'intern' | 'archiv';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'ungelesen', label: 'Ungelesen' },
  { key: 'slack', label: 'Slack' },
  { key: 'email', label: 'E-Mail' },
  { key: 'intern', label: 'Intern' },
  { key: 'archiv', label: 'Archiv' },
];

const TAG_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  'Neuer Abschluss': { bg: 'bg-emerald-100', text: 'text-emerald-800', darkBg: 'dark:bg-emerald-900/30', darkText: 'dark:text-emerald-400' },
  'Rechnung': { bg: 'bg-amber-100', text: 'text-amber-800', darkBg: 'dark:bg-amber-900/30', darkText: 'dark:text-amber-400' },
  'Auth Code': { bg: 'bg-red-100', text: 'text-red-800', darkBg: 'dark:bg-red-900/30', darkText: 'dark:text-red-400' },
  'Aufgabe': { bg: 'bg-yellow-100', text: 'text-yellow-800', darkBg: 'dark:bg-yellow-900/30', darkText: 'dark:text-yellow-400' },
  'Fulfillment': { bg: 'bg-orange-100', text: 'text-orange-800', darkBg: 'dark:bg-orange-900/30', darkText: 'dark:text-orange-400' },
  'Customer Success': { bg: 'bg-teal-100', text: 'text-teal-800', darkBg: 'dark:bg-teal-900/30', darkText: 'dark:text-teal-400' },
  'HR': { bg: 'bg-purple-100', text: 'text-purple-800', darkBg: 'dark:bg-purple-900/30', darkText: 'dark:text-purple-400' },
  'Laufzeit': { bg: 'bg-red-100', text: 'text-red-800', darkBg: 'dark:bg-red-900/30', darkText: 'dark:text-red-400' },
  'E-Mail': { bg: 'bg-blue-100', text: 'text-blue-800', darkBg: 'dark:bg-blue-900/30', darkText: 'dark:text-blue-400' },
  'System': { bg: 'bg-gray-100', text: 'text-gray-700', darkBg: 'dark:bg-gray-800', darkText: 'dark:text-gray-400' },
};

function getChannelIcon(ch: string) {
  switch (ch) {
    case 'intern': return <Bell className="h-4 w-4 text-white" />;
    case 'email': return <Mail className="h-4 w-4 text-white" />;
    case 'slack': return <Hash className="h-4 w-4 text-white" />;
    case 'aufgabe': return <CheckSquare className="h-4 w-4 text-white" />;
    default: return <Info className="h-4 w-4 text-white" />;
  }
}

function getChannelBgClass(ch: string) {
  switch (ch) {
    case 'intern': return 'bg-primary';
    case 'email': return 'bg-blue-600';
    case 'slack': return 'bg-purple-600';
    case 'aufgabe': return 'bg-orange-500';
    default: return 'bg-muted-foreground';
  }
}

function getChannelBorderColor(ch: string) {
  switch (ch) {
    case 'slack': return 'border-l-purple-600';
    case 'email': return 'border-l-blue-600';
    case 'intern': return 'border-l-primary';
    default: return 'border-l-muted-foreground';
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
  if (hours < 24) {
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function fullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getChannelLabel(ch: string, metadata?: Record<string, any>) {
  switch (ch) {
    case 'slack': return metadata?.channel_name ? `Slack — #${metadata.channel_name}` : 'Slack';
    case 'email': return 'E-Mail';
    case 'intern': return 'Intern';
    case 'aufgabe': return 'Aufgabe';
    default: return 'System';
  }
}

function getInitials(name: string | null) {
  if (!name) return '?';
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

function TagPill({ tag }: { tag: string }) {
  const colors = TAG_COLORS[tag] || TAG_COLORS['System'];
  return (
    <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-medium ${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}`}>
      {tag}
    </span>
  );
}

export default function Nachrichten() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const tabFromUrl = searchParams.get('tab') as TabKey | null;
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl && TABS.some(t => t.key === tabFromUrl) ? tabFromUrl : 'alle');
  const [search, setSearch] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counts, setCounts] = useState({ alle: 0, slack: 0, email: 0, intern: 0 });
  const listEndRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const PAGE_SIZE = 30;

  const fetchNotifications = useCallback(async (reset = false) => {
    if (!user) return;
    const p = reset ? 0 : page;
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);

    if (activeTab === 'archiv') {
      query = query.eq('archived', true);
    } else {
      query = query.eq('archived', false);
      if (activeTab === 'ungelesen') query = query.eq('read', false);
      if (activeTab === 'slack') query = query.eq('channel', 'slack');
      if (activeTab === 'email') query = query.eq('channel', 'email');
      if (activeTab === 'intern') query = query.eq('channel', 'intern');
    }

    const { data } = await query;
    const items = (data as Notification[]) || [];
    setHasMore(items.length === PAGE_SIZE);
    if (reset) {
      setNotifications(items);
      setPage(0);
    } else {
      setNotifications(prev => p === 0 ? items : [...prev, ...items]);
    }
    setLoading(false);
  }, [user, activeTab, page]);

  const fetchCounts = useCallback(async () => {
    if (!user) return;
    const base = supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('archived', false).eq('read', false);
    const [all, slack, email, intern] = await Promise.all([
      base,
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('archived', false).eq('read', false).eq('channel', 'slack'),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('archived', false).eq('read', false).eq('channel', 'email'),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('archived', false).eq('read', false).eq('channel', 'intern'),
    ]);
    setCounts({ alle: all.count || 0, slack: slack.count || 0, email: email.count || 0, intern: intern.count || 0 });
  }, [user]);

  useEffect(() => {
    setLoading(true);
    setPage(0);
    fetchNotifications(true);
    fetchCounts();
  }, [activeTab, user]);

  // Realtime
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`nachrichten-rt-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const n = payload.new as Notification;
          if (activeTab === 'archiv' && !n.archived) return;
          if (activeTab !== 'archiv' && n.archived) return;
          setNotifications(prev => [n, ...prev]);
          fetchCounts();
        } else if (payload.eventType === 'UPDATE') {
          fetchNotifications(true);
          fetchCounts();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, activeTab]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!listEndRef.current || !hasMore) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading && hasMore) {
        setPage(p => p + 1);
      }
    }, { threshold: 0.5 });
    obs.observe(listEndRef.current);
    return () => obs.disconnect();
  }, [hasMore, loading]);

  useEffect(() => {
    if (page > 0) fetchNotifications();
  }, [page]);

  const filtered = search
    ? notifications.filter(n => {
        const s = search.toLowerCase();
        return n.title.toLowerCase().includes(s) || (n.preview || '').toLowerCase().includes(s) || (n.sender_name || '').toLowerCase().includes(s);
      })
    : notifications;

  const selected = selectedId ? notifications.find(n => n.id === selectedId) : null;

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true } as any).eq('id', id);
    fetchCounts();
  };

  const toggleRead = async (n: Notification) => {
    const newRead = !n.read;
    setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: newRead } : x));
    await supabase.from('notifications').update({ read: newRead } as any).eq('id', n.id);
    fetchCounts();
  };

  const archiveNotif = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    await supabase.from('notifications').update({ archived: true, archived_at: new Date().toISOString() } as any).eq('id', id);
    fetchCounts();
  };

  const unarchiveNotif = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    await supabase.from('notifications').update({ archived: false, archived_at: null } as any).eq('id', id);
    fetchCounts();
  };

  const markAllRead = async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase.from('notifications').update({ read: true } as any).eq('user_id', user.id).eq('archived', false).eq('read', false);
    fetchCounts();
  };

  const selectNotif = (n: Notification) => {
    setSelectedId(n.id);
    if (!n.read) markAsRead(n.id);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') { setSelectedId(null); return; }
      if (!selectedId) return;
      const sel = notifications.find(n => n.id === selectedId);
      if (!sel) return;
      if (e.key === 'e' || e.key === 'E') { archiveNotif(sel.id); }
      if (e.key === 'u' || e.key === 'U') { toggleRead(sel); }
      if (e.key === 'Enter' && sel.action_url) { navigate(sel.action_url); }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = filtered.findIndex(n => n.id === selectedId);
        if (idx < filtered.length - 1) setSelectedId(filtered[idx + 1].id);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = filtered.findIndex(n => n.id === selectedId);
        if (idx > 0) setSelectedId(filtered[idx - 1].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, filtered, notifications]);

  // Mobile: show detail full-screen (only for non-email tabs)
  if (isMobile && selected && activeTab !== 'email') {
    return <DetailPanel n={selected} onBack={() => setSelectedId(null)} onArchive={activeTab === 'archiv' ? unarchiveNotif : archiveNotif} onToggleRead={toggleRead} navigate={navigate} isArchiveTab={activeTab === 'archiv'} />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-1px)] -m-4 md:-m-6">
      {/* Tabs header — always visible */}
      <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto shrink-0 bg-card">
        {TABS.map(tab => {
          const count = tab.key === 'alle' || tab.key === 'ungelesen' ? counts.alle
            : tab.key === 'slack' ? counts.slack
            : tab.key === 'email' ? counts.email
            : tab.key === 'intern' ? counts.intern : 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedId(null); setSearchParams(tab.key === 'alle' ? {} : { tab: tab.key }); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                isActive ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
              {count > 0 && tab.key !== 'archiv' && (
                <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* E-Mail tab → render full EmailPage */}
      {activeTab === 'email' ? (
        <div className="flex-1 min-h-0">
          <EmailPage mode="personal" embedded />
        </div>
      ) : (
        /* Notification tabs content */
        <div className="flex flex-1 min-h-0">
          {/* Left Panel */}
          <div className={`flex flex-col border-r border-border bg-card ${selected && !isMobile ? 'w-[380px] shrink-0' : 'flex-1'}`}>
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nachrichten durchsuchen..."
                  className="pl-9 pr-8 h-9 bg-accent border-border"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Mark all read */}
            {counts.alle > 0 && activeTab !== 'archiv' && (
              <div className="px-3 py-1.5 border-b border-border">
                <button onClick={markAllRead} className="text-xs font-medium text-primary hover:text-primary/80 transition-colors">
                  Alle gelesen
                </button>
              </div>
            )}

            {/* List */}
            <ScrollArea className="flex-1">
              {loading ? (
                <div className="p-3 space-y-2" aria-busy="true">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex gap-3 animate-pulse p-3">
                      <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-muted rounded w-2/3" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-2.5 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState tab={activeTab} navigate={navigate} />
              ) : (
                <div>
                  {filtered.map(n => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      isSelected={selectedId === n.id}
                      onClick={() => selectNotif(n)}
                      onArchive={() => activeTab === 'archiv' ? unarchiveNotif(n.id) : archiveNotif(n.id)}
                      onToggleRead={() => toggleRead(n)}
                      isArchiveTab={activeTab === 'archiv'}
                    />
                  ))}
                  <div ref={listEndRef} className="h-4" />
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right Panel (desktop) */}
          {!isMobile && selected && (
            <div className="flex-1 bg-background">
              <DetailPanel n={selected} onBack={() => setSelectedId(null)} onArchive={activeTab === 'archiv' ? unarchiveNotif : archiveNotif} onToggleRead={toggleRead} navigate={navigate} isArchiveTab={activeTab === 'archiv'} />
            </div>
          )}
          {!isMobile && !selected && (
            <div className="flex-1 bg-background flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nachricht auswählen</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Row Component ---
function NotificationRow({ n, isSelected, onClick, onArchive, onToggleRead, isArchiveTab }: {
  n: Notification; isSelected: boolean; onClick: () => void;
  onArchive: () => void; onToggleRead: () => void; isArchiveTab: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-all group border-b border-border relative ${
        isSelected ? 'bg-primary/5' : ''
      } ${
        !n.read && !isArchiveTab ? `bg-card border-l-[3px] ${getChannelBorderColor(n.channel)}` : 'bg-accent/30'
      } hover:bg-muted/50`}
      onClick={onClick}
    >
      {/* Channel icon */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getChannelBgClass(n.channel)}`}>
        {getChannelIcon(n.channel)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[13px] truncate ${!n.read ? 'font-medium text-foreground' : 'font-normal text-muted-foreground'}`}>
            {n.sender_name || n.source_name || 'System'}
          </span>
          {n.tag && <TagPill tag={n.tag} />}
        </div>
        <p className={`text-[13px] truncate mt-0.5 ${!n.read ? 'font-semibold text-foreground' : 'text-foreground'}`}>{n.title}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{n.preview}</p>
        {isArchiveTab && n.archived_at && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Archiviert {timeAgo(n.archived_at)}</p>
        )}
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
        {!n.read && !isArchiveTab && <div className="w-2 h-2 rounded-full bg-primary" />}
      </div>

      {/* Hover actions (desktop) */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-card border border-border rounded-lg shadow-sm px-1 py-0.5">
        <button
          onClick={e => { e.stopPropagation(); onArchive(); }}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          title={isArchiveTab ? 'Aus Archiv entfernen' : 'Archivieren'}
        >
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onToggleRead(); }}
          className="h-7 w-7 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
          title={n.read ? 'Als ungelesen markieren' : 'Als gelesen markieren'}
        >
          {n.read ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// --- Detail Panel ---
function DetailPanel({ n, onBack, onArchive, onToggleRead, navigate, isArchiveTab }: {
  n: Notification; onBack: () => void; onArchive: (id: string) => void;
  onToggleRead: (n: Notification) => void; navigate: (to: string) => void; isArchiveTab: boolean;
}) {
  const meta = (n.metadata || {}) as Record<string, any>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${getChannelBgClass(n.channel)}`}>
            {getChannelIcon(n.channel)}
          </div>
          <span className="text-sm font-medium text-foreground">{getChannelLabel(n.channel, meta)}</span>
          {n.tag && <TagPill tag={n.tag} />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleRead(n)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            title={n.read ? 'Als ungelesen' : 'Als gelesen'}
          >
            {n.read ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onArchive(n.id)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title={isArchiveTab ? 'Aus Archiv entfernen' : 'Archivieren'}
          >
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-6 max-w-2xl">
          {/* Sender info */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white ${getChannelBgClass(n.channel)}`}>
              {getInitials(n.sender_name || n.source_name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{n.sender_name || n.source_name || 'System'}</p>
              <p className="text-xs text-muted-foreground">{n.source_name || meta.from_email || meta.channel_name || ''}</p>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-lg font-semibold text-foreground mb-2">{n.title}</h2>
          <p className="text-[11px] text-muted-foreground mb-6">{fullDate(n.created_at)}</p>

          {/* Body */}
          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {n.body || n.preview || 'Kein Inhalt.'}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 mt-8">
            {n.action_url && (
              <Button size="sm" onClick={() => navigate(n.action_url!)}>
                Ansehen <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            )}
            {n.channel === 'slack' && meta.slack_url && (
              <Button size="sm" variant="outline" asChild>
                <a href={meta.slack_url} target="_blank" rel="noopener noreferrer">
                  In Slack öffnen <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            )}
            {n.channel === 'email' && meta.from_email && (
              <Button size="sm" variant="outline" disabled className="opacity-50">
                Antworten
                <span className="text-[9px] ml-1.5 text-muted-foreground">(Demnächst)</span>
              </Button>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

// --- Empty States ---
function EmptyState({ tab, navigate }: { tab: TabKey; navigate: (to: string) => void }) {
  const items: Record<TabKey, { icon: React.ReactNode; text: string; action?: { label: string; to: string } }> = {
    alle: { icon: <Bell className="h-10 w-10 opacity-20" />, text: 'Keine Nachrichten' },
    ungelesen: { icon: <CheckSquare className="h-10 w-10 opacity-20" />, text: 'Alles gelesen 🎉' },
    slack: { icon: <Hash className="h-10 w-10 opacity-20" />, text: 'Keine Slack-Nachrichten', action: { label: 'Slack verbinden →', to: '/einstellungen' } },
    email: { icon: <Mail className="h-10 w-10 opacity-20" />, text: 'Kein E-Mail-Konto verbunden', action: { label: 'Verbinden →', to: '/einstellungen' } },
    intern: { icon: <Bell className="h-10 w-10 opacity-20" />, text: 'Keine internen Benachrichtigungen' },
    archiv: { icon: <Archive className="h-10 w-10 opacity-20" />, text: 'Archiv ist leer' },
  };
  const s = items[tab];
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      {s.icon}
      <p className="text-sm mt-3">{s.text}</p>
      {s.action && (
        <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => navigate(s.action!.to)}>
          {s.action.label}
        </Button>
      )}
    </div>
  );
}
