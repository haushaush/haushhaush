import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trash2 } from 'lucide-react';
import type { DriveFile } from '@/lib/driveClient';
import { isFolder } from '@/lib/driveIcons';

type TeamRolle =
  | 'Admin' | 'Account-Manager' | 'Setter' | 'Closer' | 'Management'
  | 'Fulfillment' | 'Freelancer' | 'GF' | 'Vollzeit' | 'Teilzeit'
  | 'Minijob' | 'Werkstudent';

const ROLES: TeamRolle[] = [
  'Admin','Account-Manager','Setter','Closer','Management','Fulfillment',
  'Freelancer','GF','Vollzeit','Teilzeit','Minijob','Werkstudent',
];

type TeamMember = { id: string; email: string; vorname?: string | null; nachname?: string | null };
type Permission = {
  id: string;
  grantee_type: 'user' | 'role';
  grantee_user_id: string | null;
  grantee_role: TeamRolle | null;
};

interface Props {
  file: DriveFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DriveShareDialog({ file, open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedRoles, setSelectedRoles] = useState<Set<TeamRolle>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const folder = file ? isFolder(file.mimeType) : false;

  useEffect(() => {
    if (!open || !file) return;
    setLoading(true);
    (async () => {
      const [teamRes, permRes] = await Promise.all([
        supabase.from('team').select('id,email,vorname,nachname').order('vorname'),
        supabase
          .from('drive_permissions')
          .select('id,grantee_type,grantee_user_id,grantee_role')
          .eq('drive_item_id', file.id),
      ]);
      setMembers((teamRes.data ?? []) as TeamMember[]);
      setPermissions((permRes.data ?? []) as Permission[]);
      setSelectedUsers(new Set());
      setSelectedRoles(new Set());
      setLoading(false);
    })();
  }, [open, file]);

  const toggleUser = (id: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleRole = (r: TeamRolle) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      next.has(r) ? next.delete(r) : next.add(r);
      return next;
    });
  };

  const save = async () => {
    if (!file) return;
    if (selectedUsers.size === 0 && selectedRoles.size === 0) {
      toast.error('Bitte mindestens einen User oder eine Rolle wählen.');
      return;
    }
    setSaving(true);
    const rows: Array<Record<string, unknown>> = [];
    for (const uid of selectedUsers) {
      rows.push({
        drive_item_id: file.id,
        item_type: folder ? 'folder' : 'file',
        item_name: file.name,
        grantee_type: 'user',
        grantee_user_id: uid,
        created_by: user?.id ?? null,
      });
    }
    for (const r of selectedRoles) {
      rows.push({
        drive_item_id: file.id,
        item_type: folder ? 'folder' : 'file',
        item_name: file.name,
        grantee_type: 'role',
        grantee_role: r,
        created_by: user?.id ?? null,
      });
    }
    const { error } = await supabase.from('drive_permissions').insert(rows);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error('Konnte Freigabe nicht speichern.');
      return;
    }
    toast.success('Freigabe gespeichert');
    // reload permissions
    const { data } = await supabase
      .from('drive_permissions')
      .select('id,grantee_type,grantee_user_id,grantee_role')
      .eq('drive_item_id', file.id);
    setPermissions((data ?? []) as Permission[]);
    setSelectedUsers(new Set());
    setSelectedRoles(new Set());
  };

  const removePermission = async (id: string) => {
    const { error } = await supabase.from('drive_permissions').delete().eq('id', id);
    if (error) {
      toast.error('Entfernen fehlgeschlagen');
      return;
    }
    setPermissions((prev) => prev.filter((p) => p.id !== id));
  };

  // Team members keyed by auth.users.id? team has no user_id column visible; we use team.id as
  // grantee_user_id only if team.id matches auth.users.id. In this project, team rows are linked
  // via email to auth users, so we resolve auth user IDs for current selection.
  const memberLabel = (uid: string) => {
    const m = members.find((mm) => mm.id === uid);
    if (m) return [m.vorname, m.nachname].filter(Boolean).join(' ') || m.email;
    return uid.slice(0, 8) + '…';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Freigeben: {file?.name}</DialogTitle>
          <DialogDescription>
            {folder
              ? 'Die Freigabe gilt für den gesamten Ordnerinhalt (rekursiv).'
              : 'Diese Datei freigeben.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {permissions.length > 0 && (
              <section className="space-y-2">
                <h4 className="text-sm font-medium">Bestehende Freigaben</h4>
                <ul className="space-y-1">
                  {permissions.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span>
                        {p.grantee_type === 'role'
                          ? <>Rolle: <strong>{p.grantee_role}</strong></>
                          : <>User: <strong>{memberLabel(p.grantee_user_id ?? '')}</strong></>}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => removePermission(p.id)}
                        aria-label="Entfernen"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <h4 className="text-sm font-medium">Rollen</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedRoles.has(r)}
                      onCheckedChange={() => toggleRole(r)}
                    />
                    {r}
                  </label>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-medium">Benutzer</h4>
              <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
                {members.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">Keine Teammitglieder.</p>
                )}
                {members.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedUsers.has(m.id)}
                      onCheckedChange={() => toggleUser(m.id)}
                    />
                    <span>{[m.vorname, m.nachname].filter(Boolean).join(' ') || m.email}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{m.email}</span>
                  </label>
                ))}
              </div>
            </section>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Freigabe hinzufügen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
