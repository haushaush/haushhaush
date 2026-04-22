import { useEffect, useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Search, Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DriveEmptyState } from '@/components/drive/DriveEmptyState';
import { DriveFilesTable } from '@/components/drive/DriveFilesTable';
import { DriveFileDetailPanel } from '@/components/drive/DriveFileDetailPanel';
import { DriveBreadcrumbs, type Crumb } from '@/components/drive/DriveBreadcrumbs';
import { DriveFilterChips, type DriveFilter } from '@/components/drive/DriveFilterChips';
import { useDriveConnection } from '@/hooks/useDriveConnection';
import { callDriveProxy, type DriveFile, type DriveListResponse } from '@/lib/driveClient';
import { getMimeCategory } from '@/lib/driveIcons';

const ROOT_CRUMB: Crumb = { id: 'root', name: 'Meine Ablage' };

export default function DriveMeineDateien() {
  const { isConnected, loading: connLoading } = useDriveConnection();
  const [crumbs, setCrumbs] = useState<Crumb[]>([ROOT_CRUMB]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DriveFilter>('all');
  const [selected, setSelected] = useState<DriveFile | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const currentFolder = crumbs[crumbs.length - 1];

  const loadFolder = useCallback(async (folderId: string) => {
    setLoading(true);
    const data = await callDriveProxy<DriveListResponse>({ action: 'list', folderId });
    setFiles(data?.files ?? []);
    setLoading(false);
  }, []);

  const runSearch = useCallback(async (query: string) => {
    setLoading(true);
    const data = await callDriveProxy<DriveListResponse>({ action: 'search', query });
    setFiles(data?.files ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    if (search.trim()) return;
    loadFolder(currentFolder.id);
  }, [isConnected, currentFolder.id, search, loadFolder]);

  // Debounced search
  useEffect(() => {
    if (!isConnected) return;
    const q = search.trim();
    if (!q) return;
    const t = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(t);
  }, [search, isConnected, runSearch]);

  const filteredFiles = useMemo(() => {
    if (filter === 'all') return files;
    return files.filter((f) => getMimeCategory(f.mimeType) === filter);
  }, [files, filter]);

  const handleFolderOpen = (folder: DriveFile) => {
    setCrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearch('');
  };

  const handleNavigate = (index: number) => {
    setCrumbs((prev) => prev.slice(0, index + 1));
    setSearch('');
  };

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
        <h1 className="text-2xl font-semibold tracking-tight">Meine Dateien</h1>
        <p className="text-sm text-muted-foreground">Alle Dateien aus deinem persönlichen Drive.</p>
      </header>

      {!isConnected ? (
        <DriveEmptyState />
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            {crumbs.length > 1 && !search && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleNavigate(crumbs.length - 2)}
                aria-label="Zurück"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              {search ? (
                <p className="text-sm text-muted-foreground">
                  Suchergebnisse für „{search}“
                </p>
              ) : (
                <DriveBreadcrumbs crumbs={crumbs} onNavigate={handleNavigate} />
              )}
            </div>
            <div className="relative w-full sm:w-[280px]">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                placeholder="In Drive suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
                aria-label="In Drive suchen"
              />
            </div>
          </div>

          <DriveFilterChips value={filter} onChange={setFilter} />

          <DriveFilesTable
            files={filteredFiles}
            loading={loading}
            onRowClick={(f) => {
              setSelected(f);
              setPanelOpen(true);
            }}
            onFolderOpen={handleFolderOpen}
            emptyMessage={search ? 'Keine Treffer' : 'Dieser Ordner ist leer'}
          />

          <DriveFileDetailPanel file={selected} open={panelOpen} onOpenChange={setPanelOpen} />
        </>
      )}
    </div>
  );
}
