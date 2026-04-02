import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

// Data Adapter Pattern — swap for external notification aggregator later
// e.g.: import { useUnifiedNotifications } from './integrations/unified'

export type NotificationChannel = 'intern' | 'email' | 'slack' | 'aufgabe' | 'system';

export interface Notification {
  id: string;
  user_id: string;
  channel: NotificationChannel;
  title: string;
  preview: string | null;
  body: string | null;
  source_name: string | null;
  source_avatar_url: string | null;
  read: boolean;
  action_url: string | null;
  external_id: string | null;
  external_thread_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setNotifications((data as Notification[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const newNotif = payload.new as Notification;
        setNotifications(prev => [newNotif, ...prev]);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const updated = payload.new as Notification;
        setNotifications(prev => prev.map(n => n.id === updated.id ? updated : n));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const unreadByChannel = (ch: NotificationChannel) =>
    notifications.filter(n => !n.read && n.channel === ch).length;

  const markAsRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from('notifications').update({ read: true } as any).eq('id', id);
  };

  const markAllAsRead = async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase
      .from('notifications')
      .update({ read: true } as any)
      .eq('user_id', user.id)
      .eq('read', false);
  };

  return {
    notifications,
    loading,
    unreadCount,
    unreadByChannel,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}

// Helper to create a notification from anywhere in the app
export async function createNotification(
  userId: string,
  channel: NotificationChannel,
  title: string,
  preview: string,
  actionUrl?: string,
  metadata?: Record<string, any>
) {
  return supabase.from('notifications').insert({
    user_id: userId,
    channel,
    title,
    preview,
    action_url: actionUrl || null,
    metadata: metadata || {},
  } as any);
}
