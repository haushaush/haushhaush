import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ExternalLink, Send, Plus, MessageSquare, Check, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';

const ASSET_STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  'Interner Review': 'bg-blue-500/20 text-blue-300',
  'Feedback erhalten': 'bg-amber-500/20 text-amber-300',
  'Überarbeitung': 'bg-orange-500/20 text-orange-300',
  Freigegeben: 'bg-emerald-500/20 text-emerald-300',
  Abgelehnt: 'bg-destructive/20 text-destructive',
};

const PROJECT_STATUSES = ['Briefing', 'In Produktion', 'Interner Review', 'Kunde Review', 'Änderungen nötig', 'Freigegeben', 'Live', 'Archiviert'];
const ASSET_STATUSES = ['Draft', 'Interner Review', 'Feedback erhalten', 'Überarbeitung', 'Freigegeben', 'Abgelehnt'];

export default function CreativeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newAssetDialog, setNewAssetDialog] = useState(false);
  const [newAsset, setNewAsset] = useState({ file_name: '', file_type: 'image' as string });
  const [activityLog, setActivityLog] = useState<{ text: string; time: string }[]>([]);

  const fetchAll = async () => {
    if (!id) return;
    const [projRes, assetsRes, fbRes, appRes] = await Promise.all([
      supabase.from('creative_projects').select('*').eq('id', id).single(),
      supabase.from('creative_assets').select('*').eq('project_id', id).order('uploaded_at', { ascending: false }),
      supabase.from('creative_feedback').select('*'),
      supabase.from('creative_approvals').select('*').eq('project_id', id),
    ]);
    const proj = projRes.data as any;
    setProject(proj);
    if (proj) {
      const clientRes = await supabase.from('clients').select('*').eq('id', proj.client_id).single();
      setClient(clientRes.data);
    }
    const assetData = assetsRes.data || [];
    setAssets(assetData);
    const assetIds = assetData.map((a: any) => a.id);
    const filteredFb = (fbRes.data || []).filter((f: any) => assetIds.includes(f.asset_id));
    setFeedback(filteredFb);
    setApprovals(appRes.data || []);

    // Build activity log
    const log: { text: string; time: string }[] = [];
    if (proj) log.push({ text: `Projekt "${proj.name}" erstellt`, time: proj.created_at });
    assetData.forEach((a: any) => log.push({ text: `Asset "${a.file_name}" (v${a.version_nr}) hochgeladen`, time: a.uploaded_at }));
    filteredFb.forEach((f: any) => log.push({ text: `${f.author_name} (${f.author_type}): "${f.comment.substring(0, 50)}..."`, time: f.timestamp }));
    (appRes.data || []).forEach((a: any) => log.push({ text: `${a.approval_type}-Freigabe von ${a.approved_by}`, time: a.approved_at }));
    log.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    setActivityLog(log);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const updateProjectStatus = async (status: string) => {
    const update: any = { status };
    if (status === 'Kunde Review' && project?.review_token) {
      // token already generated at creation
    }
    await supabase.from('creative_projects').update(update).eq('id', id);
    setProject((p: any) => ({ ...p, status }));
    toast({ title: 'Status aktualisiert' });
  };

  const addAsset = async () => {
    if (!newAsset.file_name) return;
    await supabase.from('creative_assets').insert({
      project_id: id,
      file_name: newAsset.file_name,
      file_type: newAsset.file_type as any,
    });
    setNewAssetDialog(false);
    setNewAsset({ file_name: '', file_type: 'image' });
    fetchAll();
    toast({ title: 'Asset hinzugefügt' });
  };

  const addComment = async () => {
    if (!newComment || !selectedAsset) return;
    await supabase.from('creative_feedback').insert({
      asset_id: selectedAsset.id,
      author_name: 'Team',
      author_type: 'Intern' as any,
      comment: newComment,
    });
    setNewComment('');
    fetchAll();
  };

  const approveAsset = async (asset: any) => {
    await Promise.all([
      supabase.from('creative_assets').update({ status: 'Freigegeben' as any }).eq('id', asset.id),
      supabase.from('creative_approvals').insert({
        project_id: id!,
        asset_id: asset.id,
        approved_by: 'Team',
        approval_type: 'Intern' as any,
      }),
    ]);
    fetchAll();
    toast({ title: 'Asset freigegeben' });
  };

  const rejectAsset = async (asset: any) => {
    await supabase.from('creative_assets').update({ status: 'Überarbeitung' as any }).eq('id', asset.id);
    fetchAll();
    toast({ title: 'Änderung angefordert' });
  };

  const resolveComment = async (fb: any) => {
    await supabase.from('creative_feedback').update({ resolved: true, resolved_by: 'Team', resolved_at: new Date().toISOString() }).eq('id', fb.id);
    fetchAll();
  };

  const openAssetDrawer = (asset: any) => {
    setSelectedAsset(asset);
    setDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!project) return <div className="text-center py-12 text-muted-foreground">Projekt nicht gefunden</div>;

  const assetFeedback = feedback.filter(f => f.asset_id === selectedAsset?.id);
  const unresolvedCount = (assetId: string) => feedback.filter(f => f.asset_id === assetId && !f.resolved).length;
  const daysUntilDue = project.due_date ? Math.ceil((new Date(project.due_date).getTime() - Date.now()) / 86400000) : null;
  const reviewUrl = `${window.location.origin}/review/${project.review_token}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Button variant="ghost" onClick={() => navigate('/creatives')} className="self-start min-h-[44px]" aria-label="Zurück zu Creatives">
          <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" /> Zurück
        </Button>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold">{project.name}</h1>
            <p className="text-muted-foreground text-sm">{client?.name} · {project.due_date ? `Deadline: ${new Date(project.due_date).toLocaleDateString('de-DE')}` : 'Keine Deadline'}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={project.status} onValueChange={updateProjectStatus}>
              <SelectTrigger className="w-[200px] min-h-[44px]" aria-label="Projekt-Status ändern">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {project.drive_folder_url && (
              <Button variant="outline" asChild className="min-h-[44px]">
                <a href={project.drive_folder_url} target="_blank" rel="noopener noreferrer" aria-label="Drive Ordner öffnen">
                  <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" /> Drive Ordner
                </a>
              </Button>
            )}
            <Button className="min-h-[44px]" onClick={() => {
              navigator.clipboard.writeText(reviewUrl);
              toast({ title: 'Review-Link kopiert', description: reviewUrl });
            }}>
              <Send className="h-4 w-4 mr-2" aria-hidden="true" /> Kunden-Review senden
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets" className="min-h-[44px]">Assets & Review</TabsTrigger>
          <TabsTrigger value="briefing" className="min-h-[44px]">Briefing</TabsTrigger>
          <TabsTrigger value="timeline" className="min-h-[44px]">Timeline</TabsTrigger>
        </TabsList>

        {/* TAB: ASSETS */}
        <TabsContent value="assets" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-heading text-lg font-semibold">Assets ({assets.length})</h2>
            <Dialog open={newAssetDialog} onOpenChange={setNewAssetDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="min-h-[44px]"><Plus className="h-4 w-4 mr-1" aria-hidden="true" /> Asset hinzufügen</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Neues Asset</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="asset-name">Dateiname</Label>
                    <Input id="asset-name" value={newAsset.file_name} onChange={e => setNewAsset(a => ({ ...a, file_name: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="asset-type">Typ</Label>
                    <Select value={newAsset.file_type} onValueChange={v => setNewAsset(a => ({ ...a, file_type: v }))}>
                      <SelectTrigger id="asset-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                        <SelectItem value="carousel">Carousel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={addAsset} className="w-full min-h-[44px]">Hinzufügen</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {assets.map(asset => (
              <Card
                key={asset.id}
                className="cursor-pointer hover:ring-1 hover:ring-primary/50 transition-all"
                onClick={() => openAssetDrawer(asset)}
                tabIndex={0}
                role="button"
                aria-label={`Asset ${asset.file_name}`}
                onKeyDown={e => { if (e.key === 'Enter') openAssetDrawer(asset); }}
              >
                <CardContent className="p-0">
                  <div className="aspect-video bg-muted flex items-center justify-center rounded-t-lg overflow-hidden">
                    {asset.drive_preview_url ? (
                      <img src={asset.drive_preview_url} alt={asset.file_name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{asset.file_name}</p>
                      <Badge variant="outline" className="text-[10px]">v{asset.version_nr}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${ASSET_STATUS_COLORS[asset.status] || ''}`}>{asset.status}</Badge>
                      {unresolvedCount(asset.id) > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-destructive">
                          <MessageSquare className="h-3 w-3" aria-hidden="true" /> {unresolvedCount(asset.id)}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB: BRIEFING */}
        <TabsContent value="briefing" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Briefing</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold mb-1">Notizen</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.briefing_content || project.notes || 'Keine Briefing-Notizen hinterlegt.'}</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-1">Vertical / Zielgruppe</h3>
                <Badge>{project.vertical}</Badge>
              </div>
              {project.drive_folder_url && (
                <div>
                  <h3 className="text-sm font-semibold mb-1">Referenzmaterial</h3>
                  <a href={project.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Drive Ordner öffnen
                  </a>
                </div>
              )}
              {project.deliverables && Array.isArray(project.deliverables) && project.deliverables.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Deliverables</h3>
                  <ul className="space-y-1">
                    {(project.deliverables as string[]).map((d: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Checkbox disabled /> <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: TIMELINE */}
        <TabsContent value="timeline" className="space-y-4">
          {daysUntilDue !== null && (
            <Card>
              <CardContent className="p-4">
                <p className={`font-semibold ${daysUntilDue < 0 ? 'text-destructive' : 'text-primary'}`}>
                  {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} Tage überfällig` : `Fertigstellung in ${daysUntilDue} Tagen`}
                </p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Aktivitäten</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activityLog.map((entry, i) => (
                  <div key={i} className="flex gap-3 text-sm border-l-2 border-border pl-4 py-1">
                    <span className="text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(entry.time).toLocaleDateString('de-DE')} {new Date(entry.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>{entry.text}</span>
                  </div>
                ))}
                {activityLog.length === 0 && <p className="text-muted-foreground text-sm">Keine Aktivitäten</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Asset Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className={isMobile ? 'w-full' : 'sm:max-w-lg'}>
          <SheetHeader>
            <SheetTitle>{selectedAsset?.file_name}</SheetTitle>
          </SheetHeader>
          {selectedAsset && (
            <div className="space-y-4 mt-4 overflow-y-auto max-h-[calc(100vh-100px)]">
              {/* Preview */}
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                {selectedAsset.drive_preview_url ? (
                  <img src={selectedAsset.drive_preview_url} alt={selectedAsset.file_name} className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="h-16 w-16 text-muted-foreground" aria-hidden="true" />
                )}
              </div>

              <div className="flex items-center gap-2">
                <Badge className={ASSET_STATUS_COLORS[selectedAsset.status] || ''}>{selectedAsset.status}</Badge>
                <Badge variant="outline">v{selectedAsset.version_nr}</Badge>
                <Badge variant="outline">{selectedAsset.file_type}</Badge>
              </div>

              {/* Version history */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Versionen</h4>
                {assets.filter(a => a.file_name === selectedAsset.file_name).map(v => (
                  <div key={v.id} className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Badge variant="outline" className="text-[10px]">v{v.version_nr}</Badge>
                    <span>{new Date(v.uploaded_at).toLocaleDateString('de-DE')}</span>
                    {v.id === selectedAsset.id && <span className="text-primary font-medium">aktuell</span>}
                  </div>
                ))}
              </div>

              {/* Comment thread */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Kommentare ({assetFeedback.length})</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {assetFeedback.map(fb => (
                    <div key={fb.id} className={`p-2 rounded-lg text-sm ${fb.author_type === 'Intern' ? 'bg-secondary' : 'bg-primary/10'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-xs">{fb.author_name} ({fb.author_type})</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(fb.timestamp).toLocaleDateString('de-DE')}
                        </span>
                      </div>
                      <p className="text-xs">{fb.comment}</p>
                      {!fb.resolved && (
                        <Button size="sm" variant="ghost" onClick={() => resolveComment(fb)} className="mt-1 text-[10px] min-h-[36px]">
                          <Check className="h-3 w-3 mr-1" aria-hidden="true" /> Erledigt
                        </Button>
                      )}
                      {fb.resolved && <p className="text-[10px] text-muted-foreground mt-1">✓ Erledigt</p>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Kommentar hinzufügen..."
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
                    aria-label="Kommentar eingeben"
                  />
                  <Button size="sm" onClick={addComment} className="min-h-[44px]" aria-label="Kommentar senden">
                    <Send className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button onClick={() => approveAsset(selectedAsset)} className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700">
                  <Check className="h-4 w-4 mr-1" aria-hidden="true" /> Freigeben
                </Button>
                <Button onClick={() => rejectAsset(selectedAsset)} variant="outline" className="flex-1 min-h-[44px] border-orange-500 text-orange-400 hover:bg-orange-500/10">
                  <X className="h-4 w-4 mr-1" aria-hidden="true" /> Änderung nötig
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
