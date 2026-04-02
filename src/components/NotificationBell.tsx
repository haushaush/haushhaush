import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NotificationDrawer } from '@/components/NotificationDrawer';
import { useNotifications } from '@/hooks/useNotifications';

export function NotificationBell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const {
    notifications,
    loading,
    unreadCount,
    unreadByChannel,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative h-9 w-9"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Benachrichtigungen${unreadCount > 0 ? ` (${unreadCount} ungelesen)` : ''}`}
          >
            <Bell className="h-5 w-5 text-muted-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[10px] font-bold rounded-full bg-destructive text-destructive-foreground animate-bounce-once">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Benachrichtigungen</TooltipContent>
      </Tooltip>

      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
        loading={loading}
        unreadByChannel={unreadByChannel}
        onMarkAsRead={markAsRead}
        onMarkAllAsRead={markAllAsRead}
      />
    </>
  );
}
