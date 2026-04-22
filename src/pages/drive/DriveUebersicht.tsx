import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Files, Folder, Share2, HardDrive, Loader2 } from 'lucide-react';
import { DriveEmptyState } from '@/components/drive/DriveEmptyState';
import { DriveFilesTable } from '@/components/drive/DriveFilesTable';
import { DriveFileDetailPanel } from '@/components/drive/DriveFileDetailPanel';
import { useDriveConnection } from '@/hooks/useDriveConnection';
import { callDriveProxy, type DriveFile, type DriveListResponse, type DriveAboutResponse } from '@/lib/driveClient';
import { formatBytes, isFolder } from '@/lib/driveIcons';

export default function DriveUebersicht() {
  const navigate = useNavigate();
  const { isConnected, loading: connLoading } = useDriveConnection();
  const [recent, setRecent] = useState<DriveFile[]>([]);
  const [about, setAbout] = useState<DriveAboutResponse | null>(null);
  const [rootCount, setRootCount] = useState<{ files: number; folders: number; shared: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [recentData, aboutData, rootData, sharedData] = await Promise.all([
        callDriveProxy<DriveListResponse>({ action: 'recent' }),
        callDriveProxy<DriveAboutResponse>({ action: 'about' }),
        callDriveProxy<DriveListResponse>({ action: 'list', folderId: 'root' }),
        callDriveProxy<DriveListResponse>({ action: 'shared' }),
      ]);
      if (cancelled) return;
      setRecent(recentData?.files ?? []);
      setAbout(aboutData);
      const rootFiles = rootData?.files ?? [];
      const sharedFiles = sharedData?.files ?? [];
      setRootCount({
        files: rootFiles.filter((f) => !isFolder(f.mimeType)).length,
        folders: rootFiles.filter((f) => isFolder(f.mimeType)).length,
        shared: sharedFiles.length,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Drive — Übersicht</h1>
          <p className="text-sm text-muted-foreground">
            Zentrale Ansicht aller verbundenen Drive-Inhalte.
          </p>
        </div>
        {isConnected && (
          <Button variant="outline" size="sm" onClick={() => navigate('/drive/meine-dateien')}>
            Alle Dateien
            <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
          </Button>
        )}
      </header>

      {!isConnected ? (
        <DriveEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<Files className="h-4 w-4" />}
              label="Dateien (Root)"
              value={rootCount ? String(rootCount.files) : '…'}
            />
            <KpiCard
              icon={<Folder className="h-4 w-4" />}
              label="Ordner (Root)"
              value={rootCount ? String(rootCount.folders) : '…'}
            />
            <KpiCard
              icon={<Share2 className="h-4 w-4" />}
              label="Geteilt mit mir"
              value={rootCount ? String(rootCount.shared) : '…'}
            />
            <KpiCard
              icon={<HardDrive className="h-4 w-4" />}
              label="Speicher belegt"
              value={
                about?.storageQuota?.usage
                  ? `${formatBytes(about.storageQuota.usage)}${
                      about.storageQuota.limit ? ` / ${formatBytes(about.storageQuota.limit)}` : ''
                    }`
                  : '…'
              }
            />
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Zuletzt geändert
            </h2>
            <DriveFilesTable
              files={recent}
              loading={loading && !recent.length}
              onRowClick={(f) => {
                setSelected(f);
                setPanelOpen(true);
              }}
              emptyMessage="Keine kürzlich geänderten Dateien"
            />
          </section>

          <DriveFileDetailPanel file={selected} open={panelOpen} onOpenChange={setPanelOpen} />
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className="text-xl font-semibold tabular-nums truncate">{value}</div>
      </CardContent>
    </Card>
  );
}
