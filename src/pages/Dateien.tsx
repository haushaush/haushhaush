import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import {
  Folder, File, FileText, FileImage, FileVideo, Sheet as SheetIcon,
  Search, Grid3X3, List, Upload, Star, StarOff, Download, Link2, Eye,
  ChevronRight, Menu, X, Users, Building2, Briefcase, Euro, FolderOpen,
  ExternalLink, CloudOff,
} from 'lucide-react';

// ── Types ──
type NavSection = {
  id: string;
  label: string;
  icon: React.ReactNode;
  entityType: string;
  children?: { id: string; label: string; entityId?: string; subFolders?: string[] }[];
};

type MockFile = {
  id: string;
  name: string;
  type: 'folder' | 'file';
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  thumbnailUrl?: string;
  driveUrl?: string;
  parentPath: string;
};

type PinnedFile = {
  id: string;
  drive_file_id: string;
  file_name: string | null;
  mime_type: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
  pinned_by: string;
};

// ── Helpers ──
const FILE_TYPE_ICONS: Record<string, React.ReactNode> = {
  'image': <FileImage className="h-8 w-8 text-blue-400" aria-hidden="true" />,
  'video': <FileVideo className="h-8 w-8 text-purple-400" aria-hidden="true" />,
  'pdf': <FileText className="h-8 w-8 text-red-400" aria-hidden="true" />,
  'document': <FileText className="h-8 w-8 text-blue-300" aria-hidden="true" />,
  'spreadsheet': <SheetIcon className="h-8 w-8 text-emerald-400" aria-hidden="true" />,
  'default': <File className="h-8 w-8 text-muted-foreground" aria-hidden="true" />,
};

const FILE_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  'image': { label: 'IMG', className: 'bg-blue-500/20 text-blue-300' },
  'video': { label: 'VID', className: 'bg-purple-500/20 text-purple-300' },
  'pdf': { label: 'PDF', className: 'bg-red-500/20 text-red-300' },
  'document': { label: 'DOC', className: 'bg-blue-400/20 text-blue-200' },
  'spreadsheet': { label: 'SHEET', className: 'bg-emerald-500/20 text-emerald-300' },
};

function getFileCategory(mimeType?: string): string {
  if (!mimeType) return 'default';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
  if (mimeType.includes('document') || mimeType.includes('word') || mimeType.includes('text')) return 'document';
  return 'default';
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function timeAgo(date?: string): string {
  if (!date) return '';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `vor ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours}h`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Tagen`;
}

// ── Demo data generator ──
function generateDemoFiles(path: string): MockFile[] {
  const folders: MockFile[] = [];
  const files: MockFile[] = [];

  // Root level
  if (path === '/') {
    return [
      { id: 'f-kunden', name: 'Kunden', type: 'folder', parentPath: '/' },
      { id: 'f-intern', name: 'Intern', type: 'folder', parentPath: '/' },
      { id: 'f-hr', name: 'HR', type: 'folder', parentPath: '/' },
      { id: 'f-finanzen', name: 'Finanzen', type: 'folder', parentPath: '/' },
    ];
  }

  // Generate some demo files for any path
  const demoFiles: Omit<MockFile, 'parentPath'>[] = [
    { id: `${path}-1`, name: 'Kampagnen-Briefing.pdf', type: 'file', mimeType: 'application/pdf', size: 245000, modifiedAt: new Date(Date.now() - 86400000).toISOString() },
    { id: `${path}-2`, name: 'Ad Creative v3.png', type: 'file', mimeType: 'image/png', size: 1200000, modifiedAt: new Date(Date.now() - 172800000).toISOString() },
    { id: `${path}-3`, name: 'Performance Report.xlsx', type: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 89000, modifiedAt: new Date(Date.now() - 3600000).toISOString() },
    { id: `${path}-4`, name: 'Story Video.mp4', type: 'file', mimeType: 'video/mp4', size: 15000000, modifiedAt: new Date(Date.now() - 7200000).toISOString() },
    { id: `${path}-5`, name: 'Vertrag.docx', type: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 52000, modifiedAt: new Date(Date.now() - 259200000).toISOString() },
  ];

  return [...folders, ...demoFiles.map(f => ({ ...f, parentPath: path }))];
}

// ════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════
export default function Dateien() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [driveConnected, setDriveConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [pinnedFiles, setPinnedFiles] = useState<PinnedFile[]>([]);

  // Navigation state
  const [currentPath, setCurrentPath] = useState('/');
  const [navOpen, setNavOpen] = useState(!isMobile);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerFile, setDrawerFile] = useState<MockFile | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      const [clientsRes, teamRes, driveRes, pinnedRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('kundenstatus', 'In Betreuung'),
        supabase.from('team').select('id, name'),
        user ? supabase.from('drive_connection').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
        user ? supabase.from('drive_pinned_files').select('*').eq('pinned_by', user.id) : Promise.resolve({ data: [] }),
      ]);
      setClients(clientsRes.data || []);
      setTeamMembers(teamRes.data || []);
      setDriveConnected(!!driveRes.data);
      setPinnedFiles((pinnedRes.data || []) as PinnedFile[]);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  // Build nav sections
  const navSections: NavSection[] = useMemo(() => [
    {
      id: 'kunden', label: 'Kunden', icon: <Users className="h-4 w-4" aria-hidden="true" />, entityType: 'client',
      children: clients.map(c => ({
        id: c.id, label: c.name, entityId: c.id,
        subFolders: ['Ad Creatives', 'Berichte', 'Verträge', 'Sonstiges'],
      })),
    },
    {
      id: 'intern', label: 'Intern', icon: <Building2 className="h-4 w-4" aria-hidden="true" />, entityType: 'intern',
      children: [
        { id: 'templates', label: 'Templates', subFolders: ['Ad Creatives Templates', 'Dokument Templates'] },
        { id: 'marketing', label: 'Marketing' },
        { id: 'praesentationen', label: 'Präsentationen' },
      ],
    },
    {
      id: 'hr', label: 'HR', icon: <Briefcase className="h-4 w-4" aria-hidden="true" />, entityType: 'hr',
      children: teamMembers.map(m => ({
        id: m.id, label: m.name, entityId: m.id,
        subFolders: ['Verträge', 'Dokumente', 'Coaching'],
      })),
    },
    {
      id: 'finanzen', label: 'Finanzen', icon: <Euro className="h-4 w-4" aria-hidden="true" />, entityType: 'finanzen',
      children: [
        { id: 'rechnungen', label: 'Rechnungen', subFolders: ['2025', '2026'] },
        { id: 'belege', label: 'Belege', subFolders: ['2025', '2026'] },
        { id: 'vertraege', label: 'Verträge' },
      ],
    },
  ], [clients, teamMembers]);

  // Files for current path (demo data for now)
  const currentFiles = useMemo(() => {
    const files = generateDemoFiles(currentPath);
    if (!searchQuery) return files;
    return files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [currentPath, searchQuery]);

  // Breadcrumb parts
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return [{ label: 'Haush Haush × Viral Connect', path: '/' }, ...parts.map((p, i) => ({
      label: p, path: '/' + parts.slice(0, i + 1).join('/'),
    }))];
  }, [currentPath]);

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
    setSearchQuery('');
    if (isMobile) setNavOpen(false);
  }, [isMobile]);

  const handlePin = async (file: MockFile) => {
    if (!user) return;
    const existing = pinnedFiles.find(p => p.drive_file_id === file.id);
    if (existing) {
      await supabase.from('drive_pinned_files').delete().eq('id', existing.id);
      setPinnedFiles(prev => prev.filter(p => p.id !== existing.id));
      toast({ title: 'Entpinnt', description: file.name });
    } else {
      const { data } = await supabase.from('drive_pinned_files').insert({
        drive_file_id: file.id,
        file_name: file.name,
        mime_type: file.mimeType || null,
        drive_url: file.driveUrl || null,
        thumbnail_url: file.thumbnailUrl || null,
        pinned_by: user.id,
      }).select().single();
      if (data) {
        setPinnedFiles(prev => [...prev, data as PinnedFile]);
        toast({ title: 'Gepinnt', description: file.name });
      }
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    toast({ title: 'Upload', description: `${e.dataTransfer.files.length} Datei(en) — Drive-API-Anbindung folgt` });
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true" aria-label="Dateien werden geladen">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4"><Skeleton className="h-[600px] w-64" /><Skeleton className="h-[600px] flex-1" /></div>
      </div>
    );
  }

  // ── Not connected CTA ──
  if (!driveConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <CloudOff className="h-10 w-10 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-heading font-bold mb-2">Google Drive verbinden</h1>
        <p className="text-muted-foreground max-w-md mb-6">
          Verbinde Google Drive, um alle Agentur-Dateien zentral zu verwalten. Ordnerstruktur wird automatisch erstellt.
        </p>
        <Button size="lg" className="min-h-[44px]" onClick={() => toast({ title: 'Drive-Anbindung', description: 'Google Drive Connector wird separat eingerichtet' })}>
          <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" /> Jetzt verbinden
        </Button>
      </div>
    );
  }

  const isPinned = (fileId: string) => pinnedFiles.some(p => p.drive_file_id === fileId);

  // ════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════
  return (
    <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] overflow-hidden -mx-4 md:-mx-6 -mt-2">
      {/* ── LEFT PANEL ── */}
      <aside
        className={`${navOpen ? (isMobile ? 'fixed inset-0 z-50 bg-background' : 'w-[260px]') : 'hidden md:block md:w-[56px]'} flex-shrink-0 border-r border-border transition-all`}
        role="navigation"
        aria-label="Datei-Navigation"
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          {(navOpen || !isMobile) && (
            <span className={`font-heading font-semibold text-sm ${!navOpen ? 'hidden' : ''}`}>Dateien</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNavOpen(v => !v)}
            className="min-h-[44px] min-w-[44px]"
            aria-label={navOpen ? 'Navigation einklappen' : 'Navigation ausklappen'}
          >
            {navOpen && isMobile ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        {navOpen && (
          <ScrollArea className={`${isMobile ? 'h-[calc(100vh-60px)]' : 'h-[calc(100%-52px)]'}`}>
            <div className="p-2 space-y-1">
              {/* Root */}
              <button
                onClick={() => navigateTo('/')}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm min-h-[44px] transition-colors ${currentPath === '/' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-foreground'}`}
                aria-current={currentPath === '/' ? 'page' : undefined}
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                <span>Alle Dateien</span>
              </button>

              <Separator className="my-2" />

              {navSections.map(section => (
                <div key={section.id} className="space-y-0.5">
                  <button
                    onClick={() => navigateTo(`/${section.id}`)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium min-h-[44px] transition-colors ${currentPath.startsWith(`/${section.id}`) ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-foreground'}`}
                  >
                    {section.icon}
                    <span className="uppercase tracking-wide text-xs">{section.label}</span>
                  </button>
                  {section.children?.map(child => (
                    <button
                      key={child.id}
                      onClick={() => navigateTo(`/${section.id}/${child.label}`)}
                      className={`w-full flex items-center gap-2 px-3 pl-8 py-1.5 rounded-md text-sm min-h-[40px] transition-colors ${currentPath === `/${section.id}/${child.label}` ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <Folder className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="truncate">{child.label}</span>
                    </button>
                  ))}
                </div>
              ))}

              <Separator className="my-2" />

              {/* Pinned */}
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Gepinnte Dateien</span>
                </div>
                {pinnedFiles.length === 0 && (
                  <p className="px-3 text-xs text-muted-foreground">Keine gepinnten Dateien</p>
                )}
                {pinnedFiles.map(pf => (
                  <button
                    key={pf.id}
                    onClick={() => setDrawerFile({
                      id: pf.drive_file_id, name: pf.file_name || 'Unbenannt', type: 'file',
                      mimeType: pf.mime_type || undefined, driveUrl: pf.drive_url || undefined,
                      thumbnailUrl: pf.thumbnail_url || undefined, parentPath: '/',
                    })}
                    className="w-full flex items-center gap-2 px-3 pl-8 py-1.5 rounded-md text-sm min-h-[40px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <File className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{pf.file_name || 'Unbenannt'}</span>
                  </button>
                ))}
              </div>
            </div>
          </ScrollArea>
        )}

        {!navOpen && !isMobile && (
          <div className="p-1 space-y-1">
            {navSections.map(section => (
              <button
                key={section.id}
                onClick={() => { navigateTo(`/${section.id}`); setNavOpen(true); }}
                className="w-full flex items-center justify-center p-2 rounded-md min-h-[44px] min-w-[44px] hover:bg-muted transition-colors"
                aria-label={section.label}
                title={section.label}
              >
                {section.icon}
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ── MAIN PANEL ── */}
      <main className="flex-1 flex flex-col overflow-hidden" id="main-content">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border">
          {isMobile && !navOpen && (
            <Button variant="ghost" size="sm" onClick={() => setNavOpen(true)} className="min-h-[44px] min-w-[44px]" aria-label="Navigation öffnen">
              <Menu className="h-4 w-4" />
            </Button>
          )}

          {/* Breadcrumb */}
          <nav aria-label="Dateipfad" className="flex-1 min-w-0">
            <ol className="flex items-center gap-1 text-sm flex-wrap">
              {breadcrumbs.map((bc, i) => (
                <li key={bc.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />}
                  <button
                    onClick={() => navigateTo(bc.path)}
                    className={`hover:text-primary transition-colors truncate max-w-[150px] ${i === breadcrumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                  >
                    {bc.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Suchen..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 w-[160px] sm:w-[200px] min-h-[44px]"
                aria-label="Dateien suchen"
              />
            </div>
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${viewMode === 'grid' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                aria-label="Grid-Ansicht"
                aria-pressed={viewMode === 'grid'}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'}`}
                aria-label="Listen-Ansicht"
                aria-pressed={viewMode === 'list'}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button size="sm" className="min-h-[44px]" onClick={handleUploadClick}>
              <Upload className="h-4 w-4 mr-1" aria-hidden="true" />
              <span className="hidden sm:inline">Hochladen</span>
            </Button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={() => toast({ title: 'Upload', description: 'Drive-API-Anbindung folgt' })} />
          </div>
        </div>

        {/* File area */}
        <div
          className={`flex-1 overflow-auto p-4 relative ${dragOver ? 'ring-2 ring-primary ring-inset bg-primary/5' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
          role="region"
          aria-label="Datei-Upload Bereich"
        >
          {dragOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 pointer-events-none">
              <div className="text-center">
                <Upload className="h-12 w-12 text-primary mx-auto mb-2" aria-hidden="true" />
                <p className="text-lg font-medium">Dateien hierher ziehen</p>
              </div>
            </div>
          )}

          {currentFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Folder className="h-16 w-16 mb-4 opacity-30" aria-hidden="true" />
              <p className="text-lg font-medium">Ordner ist leer</p>
              <p className="text-sm">Lade Dateien hoch oder navigiere zu einem Unterordner</p>
            </div>
          ) : viewMode === 'grid' ? (
            // ── GRID VIEW ──
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {currentFiles.map(file => {
                const category = getFileCategory(file.mimeType);
                const badge = FILE_TYPE_BADGES[category];
                return (
                  <Card
                    key={file.id}
                    className="group cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all relative"
                    tabIndex={0}
                    role="button"
                    aria-label={`${file.name}${file.type === 'file' ? `, ${badge?.label || 'Datei'}, geändert ${timeAgo(file.modifiedAt)}` : ', Ordner'}`}
                    onClick={() => file.type === 'folder' ? navigateTo(`${currentPath === '/' ? '' : currentPath}/${file.name}`) : setDrawerFile(file)}
                    onKeyDown={e => { if (e.key === 'Enter') file.type === 'folder' ? navigateTo(`${currentPath === '/' ? '' : currentPath}/${file.name}`) : setDrawerFile(file); }}
                  >
                    <CardContent className="p-3">
                      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center mb-2 overflow-hidden relative">
                        {file.type === 'folder' ? (
                          <Folder className="h-12 w-12 text-primary" aria-hidden="true" />
                        ) : file.thumbnailUrl ? (
                          <img src={file.thumbnailUrl} alt={file.name} className="w-full h-full object-cover" />
                        ) : (
                          FILE_TYPE_ICONS[category] || FILE_TYPE_ICONS.default
                        )}
                        {/* Hover overlay for files */}
                        {file.type === 'file' && (
                          <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); setDrawerFile(file); }}
                              className="p-2 rounded-full bg-card hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label="Vorschau"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); toast({ title: 'Download', description: 'Drive-API folgt' }); }}
                              className="p-2 rounded-full bg-card hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label="Herunterladen"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); handlePin(file); }}
                              className="p-2 rounded-full bg-card hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label={isPinned(file.id) ? 'Entpinnen' : 'Pinnen'}
                            >
                              {isPinned(file.id) ? <StarOff className="h-4 w-4 text-primary" /> : <Star className="h-4 w-4" />}
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium line-clamp-2 leading-tight">{file.name}</p>
                      {file.type === 'file' && (
                        <div className="flex items-center gap-2 mt-1">
                          {badge && <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>}
                          <span className="text-[10px] text-muted-foreground">{timeAgo(file.modifiedAt)}</span>
                        </div>
                      )}
                      {file.type === 'file' && file.size && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{formatFileSize(file.size)}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            // ── LIST VIEW ──
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Dateiliste">
                <caption className="sr-only">Dateien im aktuellen Ordner</caption>
                <thead>
                  <tr className="border-b border-border text-left">
                    <th scope="col" className="py-2 px-3 font-medium text-muted-foreground">Name</th>
                    <th scope="col" className="py-2 px-3 font-medium text-muted-foreground hidden sm:table-cell">Typ</th>
                    <th scope="col" className="py-2 px-3 font-medium text-muted-foreground hidden md:table-cell">Größe</th>
                    <th scope="col" className="py-2 px-3 font-medium text-muted-foreground hidden lg:table-cell">Geändert</th>
                    <th scope="col" className="py-2 px-3 font-medium text-muted-foreground">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {currentFiles.map(file => {
                    const category = getFileCategory(file.mimeType);
                    const badge = FILE_TYPE_BADGES[category];
                    return (
                      <tr
                        key={file.id}
                        className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                        tabIndex={0}
                        onClick={() => file.type === 'folder' ? navigateTo(`${currentPath === '/' ? '' : currentPath}/${file.name}`) : setDrawerFile(file)}
                        onKeyDown={e => { if (e.key === 'Enter') file.type === 'folder' ? navigateTo(`${currentPath === '/' ? '' : currentPath}/${file.name}`) : setDrawerFile(file); }}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {file.type === 'folder' ? <Folder className="h-4 w-4 text-primary flex-shrink-0" aria-hidden="true" /> : (
                              <span className="flex-shrink-0">{FILE_TYPE_ICONS[category] ? <span className="[&>svg]:h-4 [&>svg]:w-4">{FILE_TYPE_ICONS[category]}</span> : <File className="h-4 w-4" />}</span>
                            )}
                            <span className="truncate">{file.name}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 hidden sm:table-cell">
                          {file.type === 'folder' ? <span className="text-muted-foreground">Ordner</span> : badge && <Badge className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground hidden md:table-cell">{formatFileSize(file.size)}</td>
                        <td className="py-2 px-3 text-muted-foreground hidden lg:table-cell">{file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString('de-DE') : ''}</td>
                        <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                          {file.type === 'file' && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => setDrawerFile(file)} className="p-1 hover:text-primary min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Vorschau"><Eye className="h-4 w-4" /></button>
                              <button onClick={() => handlePin(file)} className="p-1 hover:text-primary min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label={isPinned(file.id) ? 'Entpinnen' : 'Pinnen'}>
                                {isPinned(file.id) ? <StarOff className="h-4 w-4 text-primary" /> : <Star className="h-4 w-4" />}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* ── FILE PREVIEW DRAWER ── */}
      <Sheet open={!!drawerFile} onOpenChange={open => { if (!open) setDrawerFile(null); }}>
        <SheetContent className={isMobile ? 'w-full' : 'sm:max-w-[480px]'} aria-label={`Dateivorschau: ${drawerFile?.name || ''}`}>
          <SheetHeader>
            <SheetTitle className="truncate">{drawerFile?.name}</SheetTitle>
          </SheetHeader>
          {drawerFile && (
            <div className="space-y-4 mt-4 overflow-y-auto max-h-[calc(100vh-100px)]">
              {/* Preview */}
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {drawerFile.thumbnailUrl ? (
                  <img src={drawerFile.thumbnailUrl} alt={drawerFile.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {FILE_TYPE_ICONS[getFileCategory(drawerFile.mimeType)] || FILE_TYPE_ICONS.default}
                    <p className="text-xs text-muted-foreground">Keine Vorschau verfügbar</p>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Metadaten</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Typ</span>
                  <span>{FILE_TYPE_BADGES[getFileCategory(drawerFile.mimeType)]?.label || 'Unbekannt'}</span>
                  {drawerFile.size && (<><span className="text-muted-foreground">Größe</span><span>{formatFileSize(drawerFile.size)}</span></>)}
                  {drawerFile.modifiedAt && (<><span className="text-muted-foreground">Geändert</span><span>{new Date(drawerFile.modifiedAt).toLocaleDateString('de-DE')}</span></>)}
                </div>
              </div>

              <Separator />

              {/* Actions */}
              <div className="space-y-2">
                <Button variant="outline" className="w-full min-h-[44px] justify-start" onClick={() => toast({ title: 'Download', description: 'Drive-API-Anbindung folgt' })}>
                  <Download className="h-4 w-4 mr-2" aria-hidden="true" /> Herunterladen
                </Button>
                <Button variant="outline" className="w-full min-h-[44px] justify-start" onClick={() => { navigator.clipboard.writeText(drawerFile.driveUrl || 'https://drive.google.com'); toast({ title: 'Link kopiert' }); }}>
                  <Link2 className="h-4 w-4 mr-2" aria-hidden="true" /> Drive-Link kopieren
                </Button>
                <Button
                  variant="outline"
                  className="w-full min-h-[44px] justify-start"
                  onClick={() => handlePin(drawerFile)}
                >
                  {isPinned(drawerFile.id) ? (
                    <><StarOff className="h-4 w-4 mr-2 text-primary" aria-hidden="true" /> Entpinnen</>
                  ) : (
                    <><Star className="h-4 w-4 mr-2" aria-hidden="true" /> Pinnen</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
