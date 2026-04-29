import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { TrendingUp, Plug, ArrowRight, Construction } from 'lucide-react';

const TAB_LABELS: Record<string, string> = {
  uebersicht: 'Pipedrive Übersicht',
  deals: 'Pipedrive Deals',
  personen: 'Pipedrive Personen',
  pipelines: 'Pipedrive Pipelines',
};

export default function Pipedrive() {
  const { tab = 'uebersicht' } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['pipedrive-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pipedrive_settings' as any)
        .select('id, domain, sync_interval_minutes, is_active, last_sync_at, last_sync_status, last_sync_message')
        .eq('is_active', true)
        .maybeSingle();
      return data as any;
    },
  });

  const title = TAB_LABELS[tab] ?? 'Pipedrive';

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
        <Plug className="w-14 h-14 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Pipedrive nicht verbunden</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Verbinde dein Pipedrive-Konto in den Einstellungen, um Deals,
          Kontakte und Pipelines hier anzuzeigen.
        </p>
        <Button onClick={() => navigate('/einstellungen?tab=integrationen')}>
          Zur Integration-Einstellung
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            {title}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verbunden mit <span className="font-medium text-foreground">{settings.domain}.pipedrive.com</span>
            {settings.last_sync_at && (
              <> · Zuletzt synchronisiert {new Date(settings.last_sync_at).toLocaleString('de-DE')}</>
            )}
          </p>
        </div>
      </header>

      <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
        <Construction className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h2 className="text-lg font-medium mb-1">🚧 Daten-Sync wird bald gebaut</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Die Verbindung steht — Deals, Personen und Pipelines werden im
          nächsten Build-Schritt automatisch synchronisiert.
        </p>
      </div>
    </div>
  );
}
