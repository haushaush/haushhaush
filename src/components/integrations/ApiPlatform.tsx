import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Copy, AlertTriangle, Key, BookOpen, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { formatValue } from '@/lib/utils';

interface ApiToken {
  id: string;
  name: string;
  token_preview: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked: boolean;
  created_at: string;
}

interface ApiLog {
  id: string;
  method: string;
  endpoint: string;
  status_code: number;
  response_time_ms: number;
  created_at: string;
}

const SCOPES = [
  { value: 'read:all', label: 'read:all', desc: 'Alle Daten lesen' },
  { value: 'write:deals', label: 'write:deals', desc: 'Deals schreiben' },
  { value: 'write:tasks', label: 'write:tasks', desc: 'Aufgaben schreiben' },
  { value: 'write:invoices', label: 'write:invoices', desc: 'Rechnungen schreiben' },
  { value: 'admin', label: 'admin', desc: 'Admin-Zugriff (nur für Admins)' },
];

const BASE_URL = 'https://api.haushhaush.de/v1';

export function ApiPlatform() {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:all']);
  const [expiresAt, setExpiresAt] = useState('');

  const fetchData = async () => {
    if (!user) return;
    const [tokensRes, logsRes] = await Promise.all([
      supabase.from('api_tokens').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('api_logs').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setTokens((tokensRes.data || []) as any[]);
    setLogs((logsRes.data || []) as any[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const createToken = async () => {
    if (!user || !tokenName.trim()) return;
    
    // Generate token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    const token = `ahd_${hex}`;
    const preview = `ahd_${hex.slice(0, 4)}...${hex.slice(-4)}`;

    // Hash token
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase.from('api_tokens').insert({
      user_id: user.id,
      name: tokenName,
      token_hash: hashHex,
      token_preview: preview,
      scopes: selectedScopes as any,
      expires_at: expiresAt || null,
    });

    if (error) {
      toast.error('Token konnte nicht erstellt werden');
      return;
    }

    setNewToken(token);
    setCreateOpen(false);
    setShowTokenModal(true);
    setTokenName('');
    setSelectedScopes(['read:all']);
    setExpiresAt('');
    fetchData();
  };

  const revokeToken = async (id: string) => {
    await supabase.from('api_tokens').update({
      revoked: true,
      revoked_at: new Date().toISOString(),
    }).eq('id', id);
    toast.success('Token widerrufen');
    fetchData();
  };

  const copyToken = () => {
    navigator.clipboard.writeText(newToken);
    toast.success('Token kopiert');
  };

  const activeTokens = tokens.filter(t => !t.revoked);
  const totalRequests = logs.length;
  const successRate = logs.length > 0
    ? ((logs.filter(l => l.status_code >= 200 && l.status_code < 300).length / logs.length) * 100)
    : 0;
  const avgResponseTime = logs.length > 0
    ? Math.round(logs.reduce((sum, l) => sum + (l.response_time_ms || 0), 0) / logs.length)
    : 0;

  const statusColor = (code: number) => {
    if (code >= 200 && code < 300) return 'text-[var(--color-green)]';
    if (code >= 300 && code < 400) return 'text-[var(--color-orange)]';
    return 'text-[var(--color-red)]';
  };

  const relativeTime = (date: string | null) => {
    if (!date) return 'Noch nie';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Gerade eben';
    if (mins < 60) return `vor ${mins} Min.`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    const days = Math.floor(hours / 24);
    return `vor ${days} Tagen`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Agency Hub API</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Verbinde jede App nahtlos mit deinem Dashboard</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Tokens */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <Key className="h-4 w-4 text-[var(--color-teal)]" />
                API Tokens
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">Erstelle Tokens um externe Apps zu verbinden.</p>
            </div>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Neuen Token erstellen
            </Button>
          </div>

          <Card className="border-[var(--border)] bg-[var(--bg-surface)]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Scopes</TableHead>
                      <TableHead className="text-xs hidden sm:table-cell">Zuletzt</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Läuft ab</TableHead>
                      <TableHead className="text-xs text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-[var(--text-muted)] py-8">
                          Noch keine API Tokens erstellt.
                        </TableCell>
                      </TableRow>
                    ) : tokens.map(t => (
                      <TableRow key={t.id} className={t.revoked ? 'opacity-50' : ''}>
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)]">{t.name}</p>
                            <p className="text-[11px] font-mono text-[var(--text-muted)]">{t.token_preview}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(t.scopes as any as string[] || []).map((s: string) => (
                              <Badge key={s} variant="secondary" className="text-[9px] font-mono">{s}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-[var(--text-muted)] hidden sm:table-cell">
                          {relativeTime(t.last_used_at)}
                        </TableCell>
                        <TableCell className="text-xs text-[var(--text-muted)] hidden md:table-cell">
                          {t.expires_at ? new Date(t.expires_at).toLocaleDateString('de-DE') : 'Kein Ablauf'}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.revoked ? (
                            <Badge className="bg-[var(--color-red-subtle)] text-[var(--color-red-text)] border-0 text-[10px]">Widerrufen</Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[var(--color-red)] border-[var(--color-red)] hover:bg-[var(--color-red-subtle)] text-xs h-7"
                              onClick={() => revokeToken(t.id)}
                            >
                              Widerrufen
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — API Docs Preview */}
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--color-teal)]" />
            API Referenz
          </h3>

          <Card className="border-[var(--border)] bg-[#1D1D1F] dark:bg-[#111] text-white overflow-hidden">
            <CardContent className="p-5 space-y-4 font-mono text-xs">
              <div>
                <p className="text-[var(--color-teal)] text-[10px] uppercase tracking-wider mb-1">Base URL</p>
                <p className="text-gray-300">{BASE_URL}</p>
              </div>
              <div>
                <p className="text-[var(--color-teal)] text-[10px] uppercase tracking-wider mb-1">Authentication</p>
                <p className="text-gray-400">Authorization: Bearer <span className="text-orange-400">ahd_your_token_here</span></p>
              </div>
              <div className="border-t border-gray-700 pt-3 space-y-2">
                <p className="text-[var(--color-teal)] text-[10px] uppercase tracking-wider mb-2">Quick Reference</p>
                {[
                  { method: 'GET', path: '/deals', desc: 'Alle Deals abrufen', color: 'text-blue-400' },
                  { method: 'POST', path: '/deals', desc: 'Deal erstellen', color: 'text-green-400' },
                  { method: 'GET', path: '/tasks', desc: 'Alle Aufgaben', color: 'text-blue-400' },
                  { method: 'POST', path: '/tasks', desc: 'Aufgabe erstellen', color: 'text-green-400' },
                  { method: 'GET', path: '/invoices', desc: 'Alle Rechnungen', color: 'text-blue-400' },
                  { method: 'POST', path: '/notifications', desc: 'Notification senden', color: 'text-green-400' },
                  { method: 'POST', path: '/webhooks', desc: 'Webhook registrieren', color: 'text-green-400' },
                ].map((ep, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`${ep.color} font-bold w-12 text-right`}>{ep.method}</span>
                    <span className="text-gray-300">{ep.path}</span>
                    <span className="text-gray-500 text-[10px]">— {ep.desc}</span>
                  </div>
                ))}
              </div>
              <a
                href="/api-docs"
                className="block text-center text-[var(--color-teal)] text-[11px] hover:underline pt-2 border-t border-gray-700"
              >
                Vollständige Dokumentation →
              </a>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* API Usage Stats */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--color-teal)]" />
          API Nutzung (letzte 30 Tage)
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Requests', value: formatValue(totalRequests, 'number') },
            { label: 'Erfolgsrate', value: formatValue(successRate, 'percent') },
            { label: 'Ø Antwortzeit', value: `${avgResponseTime}ms` },
            { label: 'Aktive Tokens', value: String(activeTokens.length) },
          ].map(s => (
            <Card key={s.label} className="border-[var(--border)] bg-[var(--bg-surface)]">
              <CardContent className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-medium">{s.label}</p>
                <p className="text-xl font-bold text-[var(--text-primary)] mt-1">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {logs.length > 0 && (
          <Card className="border-[var(--border)] bg-[var(--bg-surface)]">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Zeitpunkt</TableHead>
                      <TableHead className="text-xs">Method</TableHead>
                      <TableHead className="text-xs">Endpoint</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Response Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(l => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs text-[var(--text-muted)]">
                          {new Date(l.created_at).toLocaleString('de-DE')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono text-[10px]">{l.method}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-[var(--text-secondary)]">{l.endpoint}</TableCell>
                        <TableCell className={`text-xs font-bold ${statusColor(l.status_code)}`}>
                          {l.status_code}
                        </TableCell>
                        <TableCell className="text-xs text-right text-[var(--text-muted)]">{l.response_time_ms}ms</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Token Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neuen API Token erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Token Name</Label>
              <Input
                value={tokenName}
                onChange={e => setTokenName(e.target.value)}
                placeholder="z.B. Zapier Integration, n8n Webhook"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="mb-2 block">Scopes</Label>
              <div className="space-y-2">
                {SCOPES.map(s => (
                  <label key={s.value} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={selectedScopes.includes(s.value)}
                      onCheckedChange={(checked) => {
                        setSelectedScopes(prev =>
                          checked ? [...prev, s.value] : prev.filter(x => x !== s.value)
                        );
                      }}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-sm font-mono font-medium">{s.label}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-2">— {s.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Ablaufdatum (optional)</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={e => setExpiresAt(e.target.value)}
                className="mt-1"
              />
              <p className="text-[11px] text-[var(--text-muted)] mt-1">Leer lassen für keinen Ablauf</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Abbrechen</Button>
            <Button onClick={createToken} disabled={!tokenName.trim()}>Token erstellen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show Token Once Modal */}
      <Dialog open={showTokenModal} onOpenChange={setShowTokenModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--color-orange)]" />
              Token erstellt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--color-teal-subtle)] p-4">
              <p className="text-xs text-[var(--text-secondary)] mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Dieser Token wird nur einmal angezeigt. Kopiere ihn jetzt.
              </p>
              <div className="flex gap-2">
                <Input
                  value={newToken}
                  readOnly
                  className="font-mono text-xs bg-[var(--bg-surface)]"
                />
                <Button variant="outline" size="icon" onClick={copyToken} className="flex-shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowTokenModal(false); setNewToken(''); }}>Verstanden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
