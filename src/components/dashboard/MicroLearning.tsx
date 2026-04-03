import { useState, useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const microLearnings = [
  { text: "73% der Kaufentscheidungen werden durch Retargeting-Anzeigen beeinflusst. PKV-Leads brauchen im Schnitt 4,2 Touchpoints bis zum Abschluss." },
  { text: "Meta Ads mit Problem-Aware Hooks erzielen 2,3x höhere CTRs als Solution-Aware Hooks — teste immer beide Stufen gleichzeitig." },
  { text: "Eine Terminquote über 20% gilt in der Versicherungsbranche als Top-Performance. Alles darunter: Qualität der Leads prüfen." },
  { text: "Das Gehirn entscheidet in 0,3 Sekunden ob eine Anzeige interessant ist — Headlines mit Zahlen performen 36% besser als solche ohne." },
  { text: "Kunden die in den ersten 48h nach Abschluss ongeboardet werden, haben eine 67% höhere Retention-Rate nach 3 Monaten." },
  { text: "Show-up Raten steigen um 40% wenn der Setter 24h vor dem Termin eine persönliche WhatsApp-Erinnerung schickt statt automatisch." },
  { text: "CPL unter €15 bei Beihilfe-PKV ist world-class. €15–25 ist gut. Über €25: Creative oder Targeting überarbeiten." },
  { text: "Leads die innerhalb von 5 Minuten angerufen werden, konvertieren 9x häufiger als Leads die nach 30+ Minuten kontaktiert werden." },
  { text: "Die besten Closer haben eine Gemeinsamkeit: Sie stellen im Durchschnitt 17 Fragen pro Gespräch — schlechte Closer nur 7." },
  { text: "Ein Upsell kostet 5x weniger als ein Neukunde. Jeder aktive Kunde ist dein günstigster Vertriebskanal." },
  { text: "A/B-Tests mit nur einer Variable gleichzeitig liefern 3x verlässlichere Ergebnisse. Teste nie Creative und Copy gleichzeitig." },
  { text: "Social Proof erhöht Conversion Rates um bis zu 270%. Trustpilot-Bewertungen direkt in Ads einbauen — das funktioniert." },
  { text: "Viral Connect Prinzip: Jeder zufriedene Kunde ist eine potenzielle Empfehlung. Empfehlungen schließen mit 4x höherer Rate." },
  { text: "Der optimale Zeitpunkt für Meta Ads im Versicherungsbereich: Dienstag–Donnerstag, 18–21 Uhr. Wochenende 20% teurer." },
  { text: "Beihilfe-PKV Zielgruppe: Beamte zwischen 28–45 Jahren reagieren 2,4x stärker auf Sicherheits-Hooks als auf Preis-Hooks." },
];

function getDayOfYear() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getStoredIndex(): number {
  try {
    const savedDate = localStorage.getItem('microlearning-date');
    const savedIndex = localStorage.getItem('microlearning-index');
    const today = new Date().toDateString();
    if (savedDate === today && savedIndex !== null) {
      return parseInt(savedIndex, 10);
    }
    const newIndex = getDayOfYear() % microLearnings.length;
    localStorage.setItem('microlearning-date', today);
    localStorage.setItem('microlearning-index', String(newIndex));
    return newIndex;
  } catch {
    return getDayOfYear() % microLearnings.length;
  }
}

export function MicroLearning() {
  const [index, setIndex] = useState(getStoredIndex);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    localStorage.setItem('microlearning-index', String(index));
    localStorage.setItem('microlearning-date', new Date().toDateString());
  }, [index]);

  const next = () => {
    setSpinning(true);
    setIndex(prev => (prev + 1) % microLearnings.length);
    setTimeout(() => setSpinning(false), 300);
  };
  const item = microLearnings[index];

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-between h-[200px] min-h-[200px] max-h-[200px] overflow-hidden p-[18px_20px]">
      <span className="inline-block text-[10px] font-semibold px-2 py-[3px] rounded bg-primary/10 text-primary shrink-0 mb-2">
        Learning des Tages
      </span>
      <p className="text-[14px] leading-[1.6] text-foreground text-center px-2 flex-1 flex items-center overflow-hidden mb-2">
        {item.text}
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={next}
            className="mx-auto block w-fit text-muted-foreground hover:text-primary transition-all duration-300 shrink-0 cursor-pointer"
            aria-label="Anderes Learning anzeigen"
          >
            <RotateCw className={`h-4 w-4 transition-transform duration-300 ${spinning ? 'rotate-180' : ''}`} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Anderes Learning anzeigen</TooltipContent>
      </Tooltip>
    </div>
  );
}
