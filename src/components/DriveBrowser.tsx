import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Folder, File, FileText, FileImage, FileVideo, Search, Grid3X3, List, Upload, Star, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DriveBrowserProps = {
  folderId?: string;
  showUpload?: boolean;
  showPin?: boolean;
  folderChips?: string[];
};

type MockFile = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
};

function getFileIcon(mimeType?: string) {
  if (!mimeType) return <File className="h-6 w-6 text-muted-foreground" aria-hidden="true" />;
  if (mimeType.startsWith('image/')) return <FileImage className="h-6 w-6 text-blue-400" aria-hidden="true" />;
  if (mimeType.startsWith('video/')) return <FileVideo className="h-6 w-6 text-purple-400" aria-hidden="true" />;
  if (mimeType.includes('pdf')) return <FileText className="h-6 w-6 text-red-400" aria-hidden="true" />;
  return <File className="h-6 w-6 text-muted-foreground" aria-hidden="true" />;
}

const DEMO_FILES: MockFile[] = [
  { id: '1', name: 'Kampagnen-Briefing.pdf', type: 'file', mimeType: 'application/pdf', size: 245000, modifiedAt: new Date(Date.now() - 86400000).toISOString() },
  { id: '2', name: 'Ad Creative v3.png', type: 'file', mimeType: 'image/png', size: 1200000, modifiedAt: new Date(Date.now() - 172800000).toISOString() },
  { id: '3', name: 'Report Q1.xlsx', type: 'file', mimeType: 'application/vnd.ms-excel', size: 89000, modifiedAt: new Date(Date.now() - 3600000).toISOString() },
];

export function DriveBrowser({ showUpload = true, showPin = true, folderChips }: DriveBrowserProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const files = search ? DEMO_FILES.filter(f => f.name.toLowerCase().includes(search.toLowerCase())) : DEMO_FILES;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {folderChips && folderChips.map(chip => (
          <Badge key={chip} variant="outline" className="cursor-pointer hover:bg-primary/10">{chip}</Badge>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input placeholder="Suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 w-[140px] text-sm" aria-label="Dateien suchen" />
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 ${viewMode === 'grid' ? 'bg-accent' : 'hover:bg-muted'}`} aria-label="Grid" aria-pressed={viewMode === 'grid'}>
            <Grid3X3 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-accent' : 'hover:bg-muted'}`} aria-label="Liste" aria-pressed={viewMode === 'list'}>
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
        {showUpload && (
          <Button size="sm" variant="outline" className="h-9" onClick={() => toast({ title: 'Upload', description: 'Drive-API-Anbindung folgt' })}>
            <Upload className="h-3.5 w-3.5 mr-1" aria-hidden="true" />Upload
          </Button>
        )}
      </div>

      {/* Files */}
      {files.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Keine Dateien gefunden</div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {files.map(f => (
            <Card key={f.id} className="group cursor-pointer hover:ring-1 hover:ring-primary/30">
              <CardContent className="p-3">
                <div className="aspect-square bg-muted rounded flex items-center justify-center mb-2">
                  {f.type === 'folder' ? <Folder className="h-8 w-8 text-primary" /> : getFileIcon(f.mimeType)}
                </div>
                <p className="text-xs font-medium line-clamp-2">{f.name}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer text-sm">
              {f.type === 'folder' ? <Folder className="h-4 w-4 text-primary" /> : getFileIcon(f.mimeType)}
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-xs text-muted-foreground">{f.modifiedAt ? new Date(f.modifiedAt).toLocaleDateString('de-DE') : ''}</span>
              {showPin && <button className="p-1 hover:text-primary" aria-label="Pinnen"><Star className="h-3.5 w-3.5" /></button>}
              <button className="p-1 hover:text-primary" aria-label="Vorschau"><Eye className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
