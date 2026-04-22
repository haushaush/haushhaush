import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { DriveEmptyState } from '@/components/drive/DriveEmptyState';
import { DriveFilesTable } from '@/components/drive/DriveFilesTable';
import { DriveFileDetailPanel } from '@/components/drive/DriveFileDetailPanel';
import { useDriveConnection } from '@/hooks/useDriveConnection';
import { callDriveProxy, type DriveFile, type DriveListResponse } from '@/lib/driveClient';

export default function DrivePapierkorb() {
  const { isConnected, loading: connLoading } = useDriveConnection();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    callDriveProxy<DriveListResponse>({ action: 'trash' }).then((d) => {
      setFiles(d?.files ?? []);
      setLoading(false);
    });
  }, [isConnected]);

  if (connLoading) {
    return (
      <div className="px-6 py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Papierkorb</h1>
        <p className="text-sm text-muted-foreground">Gelöschte Dateien aus deinem Drive.</p>
      </header>

      {!isConnected ? (
        <DriveEmptyState />
      ) : (
        <>
          <DriveFilesTable
            files={files}
            loading={loading}
            onRowClick={(f) => {
              setSelected(f);
              setPanelOpen(true);
            }}
            emptyMessage="Papierkorb ist leer"
          />
          <DriveFileDetailPanel file={selected} open={panelOpen} onOpenChange={setPanelOpen} />
        </>
      )}
    </div>
  );
}
