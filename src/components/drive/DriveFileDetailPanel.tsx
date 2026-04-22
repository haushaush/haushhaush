import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Download } from 'lucide-react';
import { getDriveIcon, formatBytes, formatDriveDate, isFolder } from '@/lib/driveIcons';
import type { DriveFile } from '@/lib/driveClient';

interface Props {
  file: DriveFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriveFileDetailPanel({ file, open, onOpenChange }: Props) {
  if (!file) return null;
  const { Icon, color } = getDriveIcon(file.mimeType);
  const folder = isFolder(file.mimeType);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[50%] overflow-y-auto">
        <SheetHeader className="text-left mb-6">
          <div className="flex items-start gap-3">
            <Icon className={`h-10 w-10 shrink-0 ${color}`} aria-hidden="true" />
            <div className="min-w-0">
              <SheetTitle className="break-words">{file.name}</SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {folder ? 'Ordner' : file.mimeType.replace('application/vnd.google-apps.', '')}
              </p>
            </div>
          </div>
        </SheetHeader>

        {file.thumbnailLink && !folder && (
          <div className="mb-6 rounded-lg overflow-hidden border border-border bg-muted">
            <img
              src={file.thumbnailLink.replace(/=s\d+$/, '=s800')}
              alt={file.name}
              className="w-full h-auto object-contain max-h-[400px]"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Geändert am</dt>
            <dd>{formatDriveDate(file.modifiedTime)}</dd>
          </div>
          {!folder && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Größe</dt>
              <dd>{formatBytes(file.size)}</dd>
            </div>
          )}
          {file.owners && file.owners.length > 0 && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Besitzer</dt>
              <dd className="flex items-center gap-2">
                {file.owners[0].photoLink && (
                  <img
                    src={file.owners[0].photoLink}
                    alt=""
                    className="h-6 w-6 rounded-full"
                    referrerPolicy="no-referrer"
                  />
                )}
                <span>{file.owners[0].displayName}</span>
                <span className="text-muted-foreground text-xs">{file.owners[0].emailAddress}</span>
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Status</dt>
            <dd className="flex gap-2">
              {file.shared && <Badge variant="outline">Geteilt</Badge>}
              {file.trashed && <Badge variant="destructive">Im Papierkorb</Badge>}
              {!file.shared && !file.trashed && <Badge variant="secondary">Privat</Badge>}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col gap-2">
          {file.webViewLink && (
            <Button asChild className="w-full">
              <a href={file.webViewLink} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                In Drive öffnen
              </a>
            </Button>
          )}
          {!folder && file.webViewLink && (
            <Button asChild variant="outline" className="w-full">
              <a
                href={`https://drive.google.com/uc?export=download&id=${file.id}`}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                Herunterladen
              </a>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
