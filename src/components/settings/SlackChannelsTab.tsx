import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Hash, Lock, Check, Users, RefreshCw, Copy, Search, AlertCircle, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  is_member: boolean;
  num_members: number;
  topic: string;
  purpose: string;
  created: number;
}

type FilterKey = 'all' | 'public' | 'private' | 'member' | 'not_member';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'public', label: 'Nur Öffentliche' },
  { key: 'private', label: 'Nur Private' },
  { key: 'member', label: 'Bot ist Member' },
  { key: 'not_member', label: 'Bot kein Member' },
];

export function SlackChannelsTab() {
  const [channels, setChannels] = useState<SlackChannel[]>([]);
  const [team, setTeam] = useState<{ name: string; domain?: string } | null>(null);
  const [stats, setStats] = useState<{ total: number; public: number; private: number; bot_member: number } | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const loadChannels = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('slack-list-channels');
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setChannels(data.channels || []);
      setTeam(data.team || null);
      setStats(data.stats || null);
    } catch (e: any) {
      setError(e.message || 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadChannels(); }, []);

  const filteredChannels = useMemo(() => {
    return channels.filter(c => {
      if (filter === 'public' && c.is_private) return false;
      if (filter === 'private' && !c.is_private) return false;
      if (filter === 'member' && !c.is_member) return false;
      if (filter === 'not_member' && c.is_member) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q)
          || c.topic?.toLowerCase().includes(q)
          || c.purpose?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [channels, filter, search]);

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Channel-ID kopiert');
    } catch {
      toast.error('Kopieren fehlgeschlagen');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Slack-Integration
            </CardTitle>
            <div className="flex items-center gap-2 text-xs">
              {loading ? (
                <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mr-1.5 animate-pulse" />
                  Lade...
                </Badge>
              ) : error ? (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Verbindungsfehler
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5" />
                  Verbunden mit {team?.name || 'Slack'}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadChannels} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Aktualisieren
          </Button>
        </CardHeader>
        {error && (
          <CardContent>
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Slack-Verbindung fehlgeschlagen: {error}. Prüfe Bot-Token in Supabase Secrets.
            </div>
          </CardContent>
        )}
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Channels', value: stats?.total, icon: Hash },
          { label: 'Öffentliche', value: stats?.public, icon: Hash },
          { label: 'Private', value: stats?.private, icon: Lock },
          { label: 'Bot Member', value: stats?.bot_member, icon: Check },
        ].map(s => (
          <Card key={s.label} className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-heading font-bold mt-1 tabular-nums">
                    {loading ? <Skeleton className="h-7 w-12" /> : (s.value ?? 0)}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + filters */}
      <Card className="border-border bg-card">
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Channel suchen..."
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  filter === f.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Channel list */}
      <div className="space-y-2">
        {loading && Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border bg-card">
            <CardContent className="p-4">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}

        {!loading && filteredChannels.length === 0 && !error && (
          <Card className="border-border bg-card">
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Keine Channels gefunden. Suche anpassen.
            </CardContent>
          </Card>
        )}

        {!loading && filteredChannels.map(c => {
          const isExpanded = expanded === c.id;
          return (
            <Card
              key={c.id}
              className="border-border bg-card cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => setExpanded(isExpanded ? null : c.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.is_private ? (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-medium text-sm truncate">{c.name}</span>
                      {c.is_private && (
                        <Badge variant="outline" className="text-[10px] h-5">Private</Badge>
                      )}
                      {c.is_member && (
                        <Badge variant="outline" className="text-[10px] h-5 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          <Check className="h-2.5 w-2.5 mr-0.5" /> Member
                        </Badge>
                      )}
                    </div>
                    {c.topic && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{c.topic}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {c.num_members ?? 0} Mitglieder
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        {c.id}
                        <button
                          onClick={(e) => { e.stopPropagation(); copyId(c.id); }}
                          className="p-0.5 hover:bg-accent rounded"
                          aria-label="Channel-ID kopieren"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1.5 text-xs">
                    {c.purpose && (
                      <div>
                        <span className="text-muted-foreground">Purpose: </span>
                        <span>{c.purpose}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Erstellt: </span>
                      <span>{new Date(c.created * 1000).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
