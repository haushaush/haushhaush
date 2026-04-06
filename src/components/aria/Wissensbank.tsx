import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, BookOpen, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  source_type: string;
  category: string;
  tags: string[];
  source_url: string | null;
  file_path: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

const CATEGORIES = [
  'Agentur & Team',
  'Sales & Vertrieb',
  'Fulfillment & Ads',
  'Kunden & CRM',
  'Finanzen',
  'Produkt & Skripte',
  'Prozesse & SOPs',
  'Sonstiges',
];

const SOURCE_TYPES: Record<string, { icon: string; label: string }> = {
  manual: { icon: '✏️', label: 'Manuell' },
  url: { icon: '🌐', label: 'Website' },
  pdf: { icon: '📄', label: 'PDF' },
  notion: { icon: '🔲', label: 'Notion' },
  slack: { icon: '💬', label: 'Slack' },
  csv: { icon: '📊', label: 'CSV' },
  sop: { icon: '📋', label: 'SOP' },
  skript: { icon: '🎯', label: 'Skript' },
  einwand: { icon: '💪', label: 'Einwand' },
  google_docs: { icon: '📝', label: 'Google Docs' },
  close_crm: { icon: '📞', label: 'Close CRM' },
  agentur: { icon: '🏢', label: 'Agentur' },
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Neueste' },
  { value: 'priority', label: 'Priorität' },
  { value: 'source', label: 'Quelle' },
];

function PriorityBadge({ priority }: { priority: number }) {
  if (priority >= 7) return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">🔴 Hoch</Badge>;
  if (priority >= 4) return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 text-[10px]">🟡 Mittel</Badge>;
  return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">🟢 Niedrig</Badge>;
}

export default function Wissensbank() {
  const { isAdminOrManager } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Alle');
  const [sortBy, setSortBy] = useState('newest');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editEntry, setEditEntry] = useState<KnowledgeEntry | null>(null);

  // Form state
  const [step, setStep] = useState<'type' | 'form'>('type');
  const [formType, setFormType] = useState('manual');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('Sonstiges');
  const [formPriority, setFormPriority] = useState([5]);
  const [formTags, setFormTags] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    const { data } = await (supabase.from('aria_knowledge' as any) as any)
      .select('*')
      .order('created_at', { ascending: false });
    setEntries((data as KnowledgeEntry[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filtered = entries
    .filter(e => categoryFilter === 'Alle' || e.category === categoryFilter)
    .filter(e => {
      if (!search) return true;
      const q = search.toLowerCase();
      return e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q) || e.tags?.some(t => t.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (sortBy === 'priority') return b.priority - a.priority;
      if (sortBy === 'source') return a.source_type.localeCompare(b.source_type);
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const resetForm = () => {
    setStep('type');
    setFormType('manual');
    setFormTitle('');
    setFormContent('');
    setFormCategory('Sonstiges');
    setFormPriority([5]);
    setFormTags('');
    setFormSourceUrl('');
    setEditEntry(null);
  };

  const openAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEdit = (entry: KnowledgeEntry) => {
    setEditEntry(entry);
    setFormType(entry.source_type);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormCategory(entry.category);
    setFormPriority([entry.priority]);
    setFormTags(entry.tags?.join(', ') || '');
    setFormSourceUrl(entry.source_url || '');
    setStep('form');
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      toast.error('Titel und Inhalt sind erforderlich');
      return;
    }
    setSaving(true);
    const tags = formTags.split(',').map(t => t.trim()).filter(Boolean);
    const { data: { session } } = await supabase.auth.getSession();

    const payload = {
      title: formTitle.trim(),
      content: formContent.trim(),
      source_type: formType,
      category: formCategory,
      tags,
      priority: formPriority[0],
      source_url: formSourceUrl || null,
      last_updated_by: session?.user?.id || null,
    };

    if (editEntry) {
      await (supabase.from('aria_knowledge' as any) as any)
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editEntry.id);
      toast.success('Eintrag aktualisiert');
    } else {
      await (supabase.from('aria_knowledge' as any) as any)
        .insert({ ...payload, created_by: session?.user?.id || null });
      toast.success('Wissen hinzugefügt');
    }

    setSaving(false);
    setShowAddModal(false);
    resetForm();
    fetchEntries();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    await (supabase.from('aria_knowledge' as any) as any).update({ is_active }).eq('id', id);
    setEntries(prev => prev.map(e => e.id === id ? { ...e, is_active } : e));
    toast.success(is_active ? 'Aktiviert' : 'Deaktiviert');
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;
    await (supabase.from('aria_knowledge' as any) as any).delete().eq('id', id);
    setEntries(prev => prev.filter(e => e.id !== id));
    toast.success('Eintrag gelöscht');
  };

  const activeCount = entries.filter(e => e.is_active).length;
  const categoriesUsed = new Set(entries.map(e => e.category)).size;
  const todayCount = entries.filter(e => new Date(e.created_at).toDateString() === new Date().toDateString()).length;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="text-primary animate-pulse text-lg font-semibold">Laden...</div></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">📚 Wissensbank</h2>
          <p className="text-sm text-muted-foreground">ARIA lernt aus diesen Quellen</p>
        </div>
        {isAdminOrManager && (
          <Button onClick={openAdd} className="gap-1.5">
            <Plus className="h-4 w-4" /> Wissen hinzufügen
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        <span><strong className="text-foreground">{activeCount}</strong> Einträge aktiv</span>
        <span>·</span>
        <span><strong className="text-foreground">{categoriesUsed}</strong> Kategorien</span>
        <span>·</span>
        <span><strong className="text-foreground">{todayCount}</strong> heute hinzugefügt</span>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 overflow-x-auto pb-1 flex-1">
          {['Alle', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors border ${
                categoryFilter === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Durchsuchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-48"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Empty state */}
      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">ARIA hat noch keine Wissensdatenbank.</p>
            <p className="text-sm text-muted-foreground mt-1">Füge Skripte, SOPs, Einwände und Informationen hinzu damit ARIA präziser und hilfreicher wird.</p>
            {isAdminOrManager && (
              <Button onClick={openAdd} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" /> Ersten Eintrag hinzufügen
              </Button>
            )}
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Keine Einträge gefunden.</p>
          </CardContent>
        </Card>
      ) : (
        /* Knowledge cards grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(entry => {
            const src = SOURCE_TYPES[entry.source_type] || { icon: '📝', label: entry.source_type };
            const visibleTags = entry.tags?.slice(0, 3) || [];
            const extraTags = (entry.tags?.length || 0) - 3;

            return (
              <Card key={entry.id} className="transition-all hover:shadow-md">
                <CardContent className="p-4">
                  {/* Top row */}
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <span>{src.icon}</span> {src.label}
                    </Badge>
                    <PriorityBadge priority={entry.priority} />
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-foreground truncate">{entry.title}</h3>

                  {/* Content preview */}
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {entry.content.slice(0, 150)}
                  </p>

                  {/* Tags */}
                  {visibleTags.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {visibleTags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded border border-primary/25 text-primary bg-primary/5">{tag}</span>
                      ))}
                      {extraTags > 0 && <span className="text-[10px] text-muted-foreground">+{extraTags} mehr</span>}
                    </div>
                  )}

                  {/* Bottom row */}
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">{entry.category}</Badge>
                      {isAdminOrManager && (
                        <Switch
                          checked={entry.is_active}
                          onCheckedChange={v => toggleActive(entry.id, v)}
                          className="scale-75 origin-left"
                        />
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(entry.updated_at), { addSuffix: true, locale: de })}
                      </span>
                    </div>
                    {isAdminOrManager && (
                      <div className="flex items-center gap-0.5">
                        {entry.source_url && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                            <a href={entry.source_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3 w-3" /></a>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(entry)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => deleteEntry(entry.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal} onOpenChange={v => { if (!v) { setShowAddModal(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Eintrag bearbeiten' : 'Wissen hinzufügen'}</DialogTitle>
          </DialogHeader>

          {step === 'type' && !editEntry ? (
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'manual', icon: '✏️', label: 'Text', sub: 'direkt' },
                { type: 'url', icon: '🌐', label: 'URL', sub: 'scrapen' },
                { type: 'pdf', icon: '📄', label: 'PDF', sub: 'upload' },
                { type: 'csv', icon: '📊', label: 'CSV', sub: 'Tabelle' },
                { type: 'skript', icon: '🎯', label: 'Skript', sub: 'Verkauf' },
                { type: 'einwand', icon: '💪', label: 'Einwand', sub: 'Handling' },
                { type: 'sop', icon: '📋', label: 'SOP', sub: 'Prozess' },
                { type: 'slack', icon: '💬', label: 'Slack', sub: 'importier' },
                { type: 'agentur', icon: '🏢', label: 'Agentur', sub: 'intern' },
              ].map(s => (
                <button
                  key={s.type}
                  onClick={() => { setFormType(s.type); setStep('form'); }}
                  className="flex flex-col items-center gap-1 p-4 rounded-xl border border-border bg-muted/30 hover:bg-primary/5 hover:border-primary/30 transition-all text-center"
                >
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-sm font-medium text-foreground">{s.label}</span>
                  <span className="text-[10px] text-muted-foreground">{s.sub}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Source badge */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  {SOURCE_TYPES[formType]?.icon} {SOURCE_TYPES[formType]?.label || formType}
                </Badge>
                {!editEntry && (
                  <button onClick={() => setStep('type')} className="text-xs text-primary hover:underline">Ändern</button>
                )}
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <Label className="text-xs">Titel *</Label>
                <Input
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder={
                    formType === 'skript' ? 'z.B. PKV Opener Skript' :
                    formType === 'einwand' ? 'z.B. Ich muss das mit meiner Frau besprechen' :
                    formType === 'sop' ? 'z.B. Kunden-Onboarding Prozess' :
                    'Titel des Wissens'
                  }
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs">Kategorie</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label className="text-xs">Priorität: {formPriority[0]} {formPriority[0] >= 7 ? '(Hoch)' : formPriority[0] >= 4 ? '(Mittel)' : '(Niedrig)'}</Label>
                <Slider value={formPriority} onValueChange={setFormPriority} min={1} max={10} step={1} />
              </div>

              {/* Tags */}
              <div className="space-y-1.5">
                <Label className="text-xs">Tags (kommagetrennt)</Label>
                <Input value={formTags} onChange={e => setFormTags(e.target.value)} placeholder="z.B. PKV, Opener, Beamte" />
              </div>

              {/* Source URL for url type */}
              {(formType === 'url' || formType === 'google_docs' || formType === 'notion') && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Quell-URL</Label>
                  <Input value={formSourceUrl} onChange={e => setFormSourceUrl(e.target.value)} placeholder="https://..." />
                </div>
              )}

              {/* Content */}
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {formType === 'skript' ? 'Skript-Text' :
                   formType === 'einwand' ? 'Einwand + Antworten' :
                   formType === 'sop' ? 'Prozess-Schritte' :
                   'Inhalt *'}
                </Label>
                <Textarea
                  value={formContent}
                  onChange={e => setFormContent(e.target.value)}
                  className="min-h-[200px]"
                  placeholder={
                    formType === 'manual' ? 'Füge hier das Wissen hinzu das ARIA kennen soll...\n\nBeispiel: "Unser Standard-Onboarding dauert 3 Tage. Am ersten Tag..."\n\nJe konkreter, desto besser kann ARIA es nutzen.' :
                    formType === 'skript' ? 'Opener:\n"Hallo [Name], hier ist [Setter] von Viral Connect..."\n\nProblem:\n"Wie läuft es aktuell mit..."\n\nLösung:\n...' :
                    formType === 'einwand' ? 'Einwand:\n"Ich muss das mit meiner Frau besprechen"\n\nAntwort 1 (Haupt-Reframe):\n"Verstehe ich total..."\n\nAntwort 2 (Alternative):\n...' :
                    formType === 'sop' ? '1. Schritt: ...\n2. Schritt: ...\n3. Schritt: ...\n\nAusnahmen:\n- ...' :
                    'Inhalt hier einfügen...'
                  }
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}>Abbrechen</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Speichern...' : editEntry ? 'Aktualisieren' : 'Speichern'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
