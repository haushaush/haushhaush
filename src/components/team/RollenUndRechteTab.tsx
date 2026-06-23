import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Shield, UserCog, X, Check, Minus } from 'lucide-react';
import type { EffectivePermission } from '@/hooks/usePermissions';

const APP_ROLES = ['admin', 'account-manager', 'setter'] as const;

interface Props {
  targetUserId: string | null;
  targetEmail: string;
}

export function RollenUndRechteTab({ targetUserId, targetEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [perms, setPerms] = useState<EffectivePermission[]>([]);

  const load = async () => {
    if (!targetUserId) { setLoading(false); return; }
    setLoading(true);
    const [r, p] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', targetUserId),
      (supabase.rpc as any)('get_effective_user_permissions', { target_user_id: targetUserId }),
    ]);
    setRoles((r.data || []).map((x: any) => x.role));
    setPerms((p.data as EffectivePermission[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetUserId]);

  if (!targetUserId) {
    return (
      <Card className="rounded-[14px]">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Dieser Mitarbeiter ({targetEmail}) ist noch nicht im Auth-System registriert.
          Berechtigungen können erst vergeben werden, nachdem der Mitarbeiter sich erstmalig angemeldet hat.
        </CardContent>
      </Card>
    );
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;

  const toggleRole = async (role: string, on: boolean) => {
    setSaving(true);
    if (on) {
      const { error } = await supabase.from('user_roles').insert({ user_id: targetUserId, role: role as any });
      if (error && !error.message.includes('duplicate')) toast.error(error.message);
    } else {
      // protect last admin: don't allow removing your own admin via this UI either
      const { error } = await supabase.from('user_roles').delete().eq('user_id', targetUserId).eq('role', role as any);
      if (error) toast.error(error.message);
    }
    setSaving(false);
    await load();
  };

  const setOverride = async (permission_key: string, mode: 'inherit' | 'allow' | 'deny') => {
    setSaving(true);
    if (mode === 'inherit') {
      await supabase.from('user_permissions' as any).delete().eq('user_id', targetUserId).eq('permission_key', permission_key);
    } else {
      await (supabase.from('user_permissions' as any) as any).upsert(
        { user_id: targetUserId, permission_key, granted: mode === 'allow' },
        { onConflict: 'user_id,permission_key' }
      );
    }
    setSaving(false);
    await load();
  };

  const grouped = perms.reduce<Record<string, EffectivePermission[]>>((acc, p) => {
    (acc[p.category] ||= []).push(p); return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card className="rounded-[14px]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><UserCog className="h-4 w-4 text-primary" />Rollen</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-2">
          {APP_ROLES.map(r => (
            <div key={r} className="flex items-center justify-between p-3 rounded-lg border border-border">
              <div>
                <p className="font-medium text-sm capitalize">{r}</p>
                <p className="text-xs text-muted-foreground">Systemrolle</p>
              </div>
              <Switch checked={roles.includes(r)} disabled={saving} onCheckedChange={(v) => toggleRole(r, v)} />
            </div>
          ))}
          {roles.length === 0 && (
            <p className="text-xs text-muted-foreground">Keine Rollen — Mitarbeiter erhält nur explizit erlaubte Rechte.</p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[14px]">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />App-Berechtigungen</CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-5">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{cat}</p>
              <div className="space-y-1.5">
                {list.map(p => {
                  const mode: 'inherit' | 'allow' | 'deny' =
                    p.user_override === null || p.user_override === undefined
                      ? 'inherit'
                      : p.user_override ? 'allow' : 'deny';
                  return (
                    <div key={p.permission_key} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-border/60 hover:border-border">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{p.label}</p>
                          {p.role_granted && <Badge variant="secondary" className="text-[10px]">via Rolle</Badge>}
                          {p.effective_granted
                            ? <Badge className="text-[10px] bg-success/20 text-success border-success/30"><Check className="h-3 w-3 mr-0.5" />aktiv</Badge>
                            : <Badge variant="outline" className="text-[10px] text-muted-foreground"><X className="h-3 w-3 mr-0.5" />inaktiv</Badge>}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{p.permission_key}</p>
                      </div>
                      <Select value={mode} disabled={saving} onValueChange={(v) => setOverride(p.permission_key, v as any)}>
                        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit"><span className="flex items-center gap-1.5"><Minus className="h-3 w-3" />Rolle erben</span></SelectItem>
                          <SelectItem value="allow"><span className="flex items-center gap-1.5 text-success"><Check className="h-3 w-3" />Erlauben</span></SelectItem>
                          <SelectItem value="deny"><span className="flex items-center gap-1.5 text-destructive"><X className="h-3 w-3" />Verweigern</span></SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="pt-2">
            <Button size="sm" variant="outline" onClick={load} disabled={saving}>Neu laden</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
