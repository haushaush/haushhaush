import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'soft' | 'hard';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pass adIds (single or many) — table row PKs from referenz_meta_ads.id */
  adIds: string[];
  adLabel?: string;
  onDeleted?: () => void;
}

export function DeleteAdDialog({ open, onClose, adIds, adLabel, onDeleted }: Props) {
  const [mode, setMode] = useState<Mode>('soft');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (adIds.length === 0) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('referenz_meta_ads' as any)
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: u.user?.id ?? null,
          delete_mode: mode,
        })
        .in('id', adIds);
      if (error) throw error;
      toast({
        title: mode === 'soft' ? 'Anzeige(n) entfernt' : 'Anzeige(n) gesperrt',
        description: mode === 'soft'
          ? 'Beim nächsten Import wieder verfügbar.'
          : 'Wird beim Import nicht mehr angeboten.',
      });
      onDeleted?.();
      onClose();
    } catch (e: any) {
      toast({ title: 'Fehler', description: e?.message ?? 'Unbekannt', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const count = adIds.length;
  const labelText = adLabel || `${count} ${count === 1 ? 'Anzeige' : 'Anzeigen'}`;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Anzeige entfernen</DialogTitle>
          <DialogDescription className="truncate">{labelText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <ModeOption
            checked={mode === 'soft'}
            onSelect={() => setMode('soft')}
            color="teal"
            title="Nur aus Showcase entfernen"
            description="Anzeige kann beim nächsten Import wieder gezogen werden"
          />
          <ModeOption
            checked={mode === 'hard'}
            onSelect={() => setMode('hard')}
            color="red"
            title="Entfernen und für Import sperren"
            description="Anzeige wird auf Blacklist gesetzt, nicht mehr importierbar"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button
            onClick={handleDelete}
            disabled={busy}
            className={mode === 'hard' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
          >
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            {mode === 'hard' ? 'Sperren' : 'Entfernen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  checked, onSelect, color, title, description,
}: { checked: boolean; onSelect: () => void; color: 'teal' | 'red'; title: string; description: string }) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all',
        checked
          ? color === 'red'
            ? 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30'
            : 'border-teal-300 bg-teal-50/60 dark:border-teal-900 dark:bg-teal-950/30'
          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className={color === 'red' ? 'mt-1 accent-red-600' : 'mt-1 accent-teal-600'}
      />
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">{title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
      </div>
    </label>
  );
}
