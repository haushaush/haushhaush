import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Zahlen = { zeiteintraege: number; checkins: number; bonus: number };

export function MitarbeiterEntfernenDialog({ person, onClose, onDone }: { person: { id: string; name: string } | null; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [variante, setVariante] = useState<'sperren' | 'loeschen'>('sperren');
  const [zahlen, setZahlen] = useState<Zahlen | null>(null);
  const [zahlenFehler, setZahlenFehler] = useState<string | null>(null);
  const [eingabe, setEingabe] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  useEffect(() => {
    setVariante('sperren'); setZahlen(null); setZahlenFehler(null); setEingabe('');
    if (!person) return;
    supabase.functions.invoke('mitarbeiter-entfernen', { body: { aktion: 'zaehlen', team_id: person.id } }).then(({ data, error }) => {
      if (error || data?.error) setZahlenFehler(data?.error || error?.message || 'Unbekannter Fehler');
      else setZahlen(data.zahlen);
    });
  }, [person]);

  if (!person) return null;
  const nameOk = eingabe.trim().toLowerCase() === person.name.trim().toLowerCase();

  const ausfuehren = async () => {
    setLaeuft(true);
    const { data, error } = await supabase.functions.invoke('mitarbeiter-entfernen', {
      body: { aktion: variante, team_id: person.id, bestaetigung_name: variante === 'loeschen' ? eingabe : undefined },
    });
    setLaeuft(false);
    if (error || data?.error) { toast({ title: 'Nicht ausgeführt', description: data?.error || error?.message, variant: 'destructive' }); return; }
    toast({
      title: variante === 'sperren' ? `${person.name}: Zugang entzogen` : `${person.name} entfernt`,
      description: data?.ergebnis === 'anonymisiert' ? 'Daten bleiben erhalten, der Personenbezug ist entfernt.' : data?.zugang === 'kein Login-Konto vorhanden' ? 'Es gab kein Login-Konto.' : undefined,
    });
    onDone();
  };

  const Option = ({ wert, titel, text }: { wert: 'sperren' | 'loeschen'; titel: string; text: string }) => (
    <button type="button" onClick={() => setVariante(wert)}
      className={`w-full text-left rounded-2xl border p-4 transition-colors ${variante === wert ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}>
      <p className="font-medium">{titel}</p>
      <p className="text-sm text-muted-foreground mt-1">{text}</p>
    </button>
  );

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{person.name} entfernen</DialogTitle>
          <DialogDescription>Wähle, was mit {person.name} passieren soll.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Option wert="sperren" titel="Zugang entziehen"
            text={`${person.name} kann sich nicht mehr anmelden. Zeiterfassungen, Check-ins und Bonus-Daten bleiben vollständig erhalten. Die Kachel steht danach unter „Ehemalige“.`} />
          <Option wert="loeschen" titel="Endgültig löschen"
            text={`Konto und Stammdaten von ${person.name} werden entfernt. Das lässt sich nicht rückgängig machen.`} />
        </div>
        {variante === 'loeschen' && (
          <div className="space-y-3 rounded-2xl bg-muted/40 p-4 text-sm">
            {zahlenFehler ? <p className="text-destructive">Anzahl der Datensätze nicht ermittelbar: {zahlenFehler}</p>
              : !zahlen ? <p className="text-muted-foreground">Datensätze werden gezählt …</p>
              : (
                <ul className="space-y-1 tabular-nums">
                  <li>{zahlen.zeiteintraege.toLocaleString('de-DE')} Zeiteinträge</li>
                  <li>{zahlen.checkins.toLocaleString('de-DE')} Check-ins</li>
                  <li>{zahlen.bonus.toLocaleString('de-DE')} Bonus-Datensätze</li>
                </ul>
              )}
            <p>Diese Datensätze bleiben erhalten, nur der Personenbezug entfällt. Hängen Daten am Konto, wird die Anmeldung dauerhaft gesperrt und Name, E-Mail und Kontaktdaten werden entfernt, statt das Konto technisch zu löschen — sonst würden die Daten mitgelöscht.</p>
            <div>
              <p className="text-muted-foreground mb-1">Zum Bestätigen den Namen eintippen: <span className="font-medium text-foreground">{person.name}</span></p>
              <Input value={eingabe} onChange={e => setEingabe(e.target.value)} placeholder={person.name} />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={laeuft}>Abbrechen</Button>
          <Button variant="destructive" onClick={ausfuehren}
            disabled={laeuft || (variante === 'loeschen' && (!nameOk || !zahlen))}>
            {laeuft ? 'Wird ausgeführt …' : variante === 'sperren' ? 'Zugang entziehen' : 'Endgültig löschen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
