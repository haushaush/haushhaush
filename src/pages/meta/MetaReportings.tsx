import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, RotateCcw, Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ReportingSetting {
  id: string;
  meta_account_id: string;
  meta_account_name: string | null;
  client_id: string | null;
  client_name: string | null;
  customer_email_source: string | null;
  reporting_email: string | null;
  reporting_email_overridden: boolean;
  reporting_enabled: boolean;
  slack_enabled: boolean;
  email_enabled: boolean;
  is_active: boolean;
}

type FilterKey = 'all' | 'reporting' | 'slack' | 'mail' | 'no_mail' | 'overridden';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'reporting', label: 'Reporting aktiv' },
  { key: 'slack', label: 'Slack aktiv' },
  { key: 'mail', label: 'Mail aktiv' },
  { key: 'no_mail', label: 'Ohne Reporting-Mail' },
  { key: 'overridden', label: 'Manuell geänderte Mail' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeId(raw: string | null | undefined) {
  const s = String(raw ?? '').trim();
  if (!s) return { prefixed: '', numeric: '' };
  return { prefixed: s.startsWith('act_') ? s : `act_${s}`, numeric: s.startsWith('act_') ? s.slice(4) : s };
}

function normName(v: unknown) {
  return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export default function MetaReportings() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole?.('admin') ?? false;
  const [rows, setRows] = useState<ReportingSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('meta_reporting_settings' as any)
      .select('*')
      .order('meta_account_name', { ascending: true, nullsFirst: false });
    if (error) {
      toast.error('Reporting-Einstellungen konnten nicht geladen werden', { description: error.message });
    } else {
      setRows((data as any as ReportingSetting[]) ?? []);
      setEmailDrafts({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const syncAccounts = async () => {
    setSyncing(true);
    try {
      // 1) Werbekonten live von Meta holen (aktualisiert meta_accounts_cache)
      const { error: liveErr } = await supabase.functions.invoke('list-meta-accounts', { body: {} });
      if (liveErr) {
        toast.warning('Live-Abruf der Werbekonten fehlgeschlagen – nutze zwischengespeicherte Liste', {
          description: liveErr.message,
        });
      }

      const [{ data: accounts, error: accErr }, { data: existing }] = await Promise.all([
        supabase.from('meta_accounts_cache').select('meta_account_id, name, status'),
        supabase.from('meta_reporting_settings' as any).select('meta_account_id'),
      ]);
      if (accErr) throw accErr;

      const known = new Set(((existing as any[]) ?? []).map((r) => r.meta_account_id));
      const missing = (accounts ?? []).filter((a) => !known.has(normalizeId(a.meta_account_id).prefixed));


      if (missing.length === 0) {
        toast.success('Alle Werbekonten sind bereits synchronisiert');
        await load();
        return;
      }

      const variants = new Set<string>();
      for (const a of missing) {
        const v = normalizeId(a.meta_account_id);
        variants.add(v.prefixed);
        variants.add(v.numeric);
      }
      const variantList = [...variants].filter(Boolean);
      const quoted = variantList.map((v) => `"${v}"`).join(',');

      const [{ data: clientRows }, { data: kmaRows }] = await Promise.all([
        supabase
          .from('clients')
          .select('id, name, email, meta_account_id, meta_account_ids')
          .or(`meta_account_id.in.(${quoted}),meta_account_ids.ov.{${quoted}}`),
        supabase
          .from('kunde_meta_accounts')
          .select('meta_account_id, meta_account_name, client_id')
          .in('meta_account_id', variantList),
      ]);

      const byVariant = new Map<string, { id: string; name: string | null; email: string | null }>();
      for (const c of clientRows ?? []) {
        const ids = [
          ...(c.meta_account_id ? [c.meta_account_id] : []),
          ...(((c.meta_account_ids as string[] | null) ?? []) as string[]),
        ];
        for (const id of ids) {
          const v = normalizeId(id);
          for (const variant of [v.prefixed, v.numeric]) {
            if (variant && variants.has(variant) && !byVariant.has(variant)) {
              byVariant.set(variant, { id: c.id, name: c.name, email: c.email });
            }
          }
        }
      }

      const kmaClientIds = [...new Set(((kmaRows as any[]) ?? []).map((r) => r.client_id).filter(Boolean))];
      if (kmaClientIds.length > 0) {
        const { data: kmaClients } = await supabase
          .from('clients')
          .select('id, name, email')
          .in('id', kmaClientIds as string[]);
        const map = new Map((kmaClients ?? []).map((c) => [c.id, c]));
        for (const r of (kmaRows as any[]) ?? []) {
          const c = r.client_id ? map.get(r.client_id) : null;
          if (!c) continue;
          const v = normalizeId(r.meta_account_id);
          for (const variant of [v.prefixed, v.numeric]) {
            if (variant && !byVariant.has(variant)) {
              byVariant.set(variant, { id: c.id, name: c.name, email: c.email });
            }
          }
        }
      }

      // Name fallback only when no ID match exists.
      const { data: allClients } = await supabase.from('clients').select('id, name, email').limit(5000);
      const byName = new Map<string, { id: string; name: string | null; email: string | null }>();
      for (const c of allClients ?? []) {
        const n = normName(c.name);
        if (n && !byName.has(n)) byName.set(n, { id: c.id, name: c.name, email: c.email });
      }

      const inserts = missing.map((a) => {
        const v = normalizeId(a.meta_account_id);
        const hit = byVariant.get(v.prefixed) || byVariant.get(v.numeric) || byName.get(normName(a.name)) || null;
        const email = hit?.email ?? null;
        return {
          meta_account_id: v.prefixed,
          meta_account_name: a.name ?? null,
          client_id: hit?.id ?? null,
          client_name: hit?.name ?? null,
          customer_email_source: email,
          reporting_email: email,
          reporting_email_overridden: false,
          is_active: (a.status ?? 'active') === 'active',
          last_synced_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        };
      });

      const { error: insErr } = await supabase
        .from('meta_reporting_settings' as any)
        .upsert(inserts as any, { onConflict: 'meta_account_id', ignoreDuplicates: true });
      if (insErr) throw insErr;

      toast.success(`${inserts.length} Werbekonto${inserts.length === 1 ? '' : 'en'} hinzugefügt`);
      await load();
    } catch (e: any) {
      toast.error('Synchronisierung fehlgeschlagen', { description: e?.message });
    } finally {
      setSyncing(false);
    }
  };

  const patch = async (row: ReportingSetting, values: Partial<ReportingSetting>) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...values } : r)));
    const { error } = await supabase
      .from('meta_reporting_settings' as any)
      .update({ ...values, updated_by: user?.id ?? null } as any)
      .eq('id', row.id);
    if (error) {
      toast.error('Speichern fehlgeschlagen', { description: error.message });
      await load();
      return;
    }
    toast.success('Reporting-Einstellung gespeichert');
  };

  const saveEmail = async (row: ReportingSetting) => {
    const draft = emailDrafts[row.id];
    if (draft === undefined) return;
    const value = draft.trim();
    if (value === (row.reporting_email ?? '')) {
      setEmailDrafts((p) => {
        const n = { ...p };
        delete n[row.id];
        return n;
      });
      return;
    }
    if (value && !EMAIL_RE.test(value)) {
      toast.error('Ungültige E-Mail-Adresse');
      return;
    }
    await patch(row, {
      reporting_email: value || null,
      reporting_email_overridden: true,
    });
    setEmailDrafts((p) => {
      const n = { ...p };
      delete n[row.id];
      return n;
    });
  };

  const resetEmail = (row: ReportingSetting) => {
    setEmailDrafts((p) => {
      const n = { ...p };
      delete n[row.id];
      return n;
    });
    patch(row, {
      reporting_email: row.customer_email_source ?? null,
      reporting_email_overridden: false,
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.meta_account_name ?? ''} ${r.meta_account_id} ${r.client_name ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case 'reporting':
          return r.reporting_enabled;
        case 'slack':
          return r.slack_enabled;
        case 'mail':
          return r.email_enabled;
        case 'no_mail':
          return !r.reporting_email;
        case 'overridden':
          return r.reporting_email_overridden;
        default:
          return true;
      }
    });
  }, [rows, search, filter]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Nur Administratoren haben Zugriff auf diesen Bereich.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meta Reportings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Steuere pro Werbekonto, ob Reportings, Slack-Benachrichtigungen und Kundenmails aktiv sind.
          </p>
        </div>
        <Button variant="outline" onClick={syncAccounts} disabled={syncing}>
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Accounts synchronisieren
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Werbekonto oder Kunde suchen"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? 'default' : 'outline'}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Lädt…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Keine Werbekonten gefunden. Nutze „Accounts synchronisieren“, um bekannte Meta-Werbekonten zu übernehmen.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const draft = emailDrafts[row.id];
            const emailValue = draft !== undefined ? draft : row.reporting_email ?? '';
            const mailWarning = row.email_enabled && !row.reporting_email;
            return (
              <div key={row.id} className="rounded-lg border bg-card p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1fr)] lg:items-start">
                  {/* Account */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{row.meta_account_name || 'Ohne Namen'}</span>
                      <Badge variant={row.is_active ? 'secondary' : 'outline'}>
                        {row.is_active ? 'Aktiv' : 'Inaktiv'}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums mt-1">{row.meta_account_id}</div>
                    <div className="text-sm text-muted-foreground mt-1 truncate">
                      {row.client_name || 'Kein Kunde zugeordnet'}
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-wrap items-center gap-5">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={row.reporting_enabled}
                        onCheckedChange={(v) => patch(row, { reporting_enabled: v })}
                      />
                      Reporting
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={row.slack_enabled}
                        disabled={!row.reporting_enabled}
                        onCheckedChange={(v) => patch(row, { slack_enabled: v })}
                      />
                      Slack
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={row.email_enabled}
                        disabled={!row.reporting_enabled}
                        onCheckedChange={(v) => patch(row, { email_enabled: v })}
                      />
                      Mail
                    </label>
                    {!row.reporting_enabled && (
                      <span className="text-xs text-muted-foreground">Reporting ist deaktiviert</span>
                    )}
                  </div>

                  {/* Mail */}
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        type="email"
                        value={emailValue}
                        placeholder="Reporting-Mail"
                        onChange={(e) => setEmailDrafts((p) => ({ ...p, [row.id]: e.target.value }))}
                        onBlur={() => saveEmail(row)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Auf Kundenmail zurücksetzen"
                        onClick={() => resetEmail(row)}
                        disabled={!row.customer_email_source && !row.reporting_email}
                      >
                        <RotateCcw className="h-4 w-4" />
                        <span className="hidden xl:inline">Auf Kundenmail zurücksetzen</span>
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Kundenmail: {row.customer_email_source || '—'}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {row.reporting_email_overridden && (
                        <Badge variant="outline" className="text-xs">manuell geändert</Badge>
                      )}
                      {mailWarning && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Mail aktiv, aber keine Reporting-Mail hinterlegt
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
