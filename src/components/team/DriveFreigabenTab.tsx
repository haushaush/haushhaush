import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FolderOpen, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props { targetUserId: string | null; }

export function DriveFreigabenTab({ targetUserId }: Props) {
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<any[]>([]);

  useEffect(() => {
    if (!targetUserId) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from('drive_permissions' as any)
        .select('*')
        .or(`grantee_user_id.eq.${targetUserId},grantee_type.eq.role`)
        .limit(200);
      setPerms(data || []);
      setLoading(false);
    })();
  }, [targetUserId]);

  if (!targetUserId) {
    return (
      <Card className="rounded-[14px]"><CardContent className="p-6 text-sm text-muted-foreground">
        Drive-Freigaben werden erst angezeigt, sobald der Mitarbeiter im Auth-System registriert ist.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-[14px]">
        <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" />Drive-Freigaben</CardTitle>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link to="/drive"><ExternalLink className="h-3.5 w-3.5" />Drive öffnen</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-xs text-muted-foreground mb-3">
            Generelles Recht <code className="text-[11px]">drive.view</code> wird im Tab „Rollen & Rechte" gesteuert.
            Konkrete Datei-/Ordnerfreigaben werden weiterhin direkt im Drive verwaltet.
          </p>
          {loading ? <Skeleton className="h-24" /> : perms.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine direkten Drive-Freigaben gefunden.</p>
          ) : (
            <div className="space-y-1.5">
              {perms.slice(0, 50).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-xs p-2 rounded border border-border/60">
                  <span className="font-mono truncate">{p.drive_item_id}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {p.grantee_type === 'role' ? `Rolle: ${p.grantee_role}` : 'direkt'}
                  </Badge>
                </div>
              ))}
              {perms.length > 50 && <p className="text-[11px] text-muted-foreground">+ {perms.length - 50} weitere…</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
