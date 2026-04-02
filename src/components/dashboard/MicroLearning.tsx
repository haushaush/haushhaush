import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const microLearnings = [
  { emoji: "💡", text: "73% der Kaufentscheidungen werden durch Retargeting-Anzeigen beeinflusst. PKV-Leads brauchen im Schnitt 4,2 Touchpoints bis zum Abschluss." },
  { emoji: "📈", text: "Meta Ads mit Problem-Aware Hooks erzielen 2,3x höhere CTRs als Solution-Aware Hooks — teste immer beide Stufen gleichzeitig." },
  { emoji: "🎯", text: "Eine Terminquote über 20% gilt in der Versicherungsbranche als Top-Performance. Alles darunter: Qualität der Leads prüfen." },
  { emoji: "🧠", text: "Das Gehirn entscheidet in 0,3 Sekunden ob eine Anzeige interessant ist — Headlines mit Zahlen performen 36% besser als solche ohne." },
  { emoji: "🚀", text: "Kunden die in den ersten 48h nach Abschluss ongeboardet werden, haben eine 67% höhere Retention-Rate nach 3 Monaten." },
  { emoji: "💬", text: "Show-up Raten steigen um 40% wenn der Setter 24h vor dem Termin eine persönliche WhatsApp-Erinnerung schickt statt automatisch." },
  { emoji: "🔥", text: "CPL unter €15 bei Beihilfe-PKV ist world-class. €15–25 ist gut. Über €25: Creative oder Targeting überarbeiten." },
  { emoji: "⚡", text: "Leads die innerhalb von 5 Minuten angerufen werden, konvertieren 9x häufiger als Leads die nach 30+ Minuten kontaktiert werden." },
  { emoji: "🏆", text: "Die besten Closer haben eine Gemeinsamkeit: Sie stellen im Durchschnitt 17 Fragen pro Gespräch — schlechte Closer nur 7." },
  { emoji: "💎", text: "Ein Upsell kostet 5x weniger als ein Neukunde. Jeder aktive Kunde ist dein günstigster Vertriebskanal." },
  { emoji: "📊", text: "A/B-Tests mit nur einer Variable gleichzeitig liefern 3x verlässlichere Ergebnisse. Teste nie Creative und Copy gleichzeitig." },
  { emoji: "🎪", text: "Social Proof erhöht Conversion Rates um bis zu 270%. Trustpilot-Bewertungen direkt in Ads einbauen — das funktioniert." },
  { emoji: "💡", text: "Viral Connect Prinzip: Jeder zufriedene Kunde ist eine potenzielle Empfehlung. Empfehlungen schließen mit 4x höherer Rate." },
  { emoji: "📈", text: "Der optimale Zeitpunkt für Meta Ads im Versicherungsbereich: Dienstag–Donnerstag, 18–21 Uhr. Wochenende 20% teurer." },
  { emoji: "🎯", text: "Beihilfe-PKV Zielgruppe: Beamte zwischen 28–45 Jahren reagieren 2,4x stärker auf Sicherheits-Hooks als auf Preis-Hooks." },
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
    // New day — advance
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

  useEffect(() => {
    localStorage.setItem('microlearning-index', String(index));
    localStorage.setItem('microlearning-date', new Date().toDateString());
  }, [index]);

  const next = () => setIndex(prev => (prev + 1) % microLearnings.length);
  const item = microLearnings[index];

  return (
    <div className="max-w-[560px] w-full mx-auto mt-6">
      <div className="flex items-start gap-3 bg-card border border-border rounded-xl px-5 py-4">
        <span className="text-2xl leading-none shrink-0 mt-0.5">{item.emoji}</span>
        <div className="flex-1 min-w-0">
          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent text-accent-foreground mb-1">
            Tipp des Tages
          </span>
          <p className="text-[13px] text-foreground leading-relaxed">{item.text}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={next}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors shrink-0 mt-0.5"
              aria-label="Anderen Tipp anzeigen"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">Anderen Tipp anzeigen</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
