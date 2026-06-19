import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { getDriveIcon, formatBytes, formatDriveDate, isFolder } from '@/lib/driveIcons';
import type { DriveFile } from '@/lib/driveClient';

interface Props {
  files: DriveFile[];
  loading?: boolean;
  onRowClick?: (file: DriveFile) => void;
  onFolderOpen?: (folder: DriveFile) => void;
  emptyMessage?: string;
}

export function DriveFilesTable({ files, loading, onRowClick, onFolderOpen, emptyMessage = 'Keine Dateien' }: Props) {
  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">Lädt Dateien…</div>
    );
  }
  if (!files.length) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">{emptyMessage}</div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[50%]">Name</TableHead>
            <TableHead>Besitzer</TableHead>
            <TableHead>Geändert</TableHead>
            <TableHead className="text-right">Größe</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => {
            const { Icon, color } = getDriveIcon(file.mimeType);
            const folder = isFolder(file.mimeType);
            const owner = file.owners?.[0];
            return (
              <TableRow
                key={file.id}
                className="cursor-pointer"
                onClick={() => folder ? onFolderOpen?.(file) : onRowClick?.(file)}
                onDoubleClick={() => {
                  if (folder) onFolderOpen?.(file);
                  else if (file.webViewLink) window.open(file.webViewLink, '_blank', 'noreferrer');
                }}
              >
                <TableCell>
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`h-5 w-5 shrink-0 ${color}`} aria-hidden="true" />
                    <span className="truncate font-medium">{file.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 min-w-0">
                    {owner?.photoLink && (
                      <img
                        src={owner.photoLink}
                        alt=""
                        className="h-5 w-5 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <span className="text-sm truncate">{owner?.displayName ?? '—'}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDriveDate(file.modifiedTime)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                  {folder ? '—' : formatBytes(file.size)}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {file.webViewLink && (
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                      <a href={file.webViewLink} target="_blank" rel="noreferrer" aria-label="In Drive öffnen">
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
