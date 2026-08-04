import { PageShell } from '@/components/layout/PageShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Trophy } from 'lucide-react';

export default function BonusCockpit() {
  return (
    <PageShell>
      <PageHeader
        title="Bonus-Cockpit"
        description="Monatliche Leistungsdaten, Bonuspunkte und Auszahlung für das Customer Success Bonusmodell."
      />
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Trophy className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-base font-medium">Auswertung folgt</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Datenmodell und Berechtigungen stehen. Erfassung, Punkteberechnung und
            Freigabe werden in der nächsten Stufe ergänzt.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
