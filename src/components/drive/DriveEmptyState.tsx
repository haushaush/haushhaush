import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface Props {
  title?: string;
}

export function DriveEmptyState({ title = 'Google Drive nicht verbunden' }: Props) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-6 rounded-2xl border border-dashed border-border bg-muted/20">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-5">
        <CloudOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Verbinde dein Google Drive Konto in den Einstellungen, um Dateien direkt im Portal zu verwalten.
      </p>
      <Button onClick={() => navigate('/einstellungen')}>
        Jetzt verbinden
      </Button>
    </div>
  );
}
