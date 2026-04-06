import { useState, useCallback } from 'react';
import { RotateCw } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const microLearnings = [
  "CPL unter €15 bei Beihilfe-PKV ist world-class. €15–25 ist gut. Über €25: Creative oder Targeting überarbeiten.",
  "Broad Targeting schlägt enge Zielgruppen bei Meta seit iOS 14 in 80% der Fälle — lass den Algorithmus lernen.",
  "Video-Ads performen bei PKV-Leads 2,3x besser als Static Images wenn die ersten 3 Sekunden einen Schmerz ansprechen.",
  "Retargeting-Audiences unter 1.000 Personen sind zu klein für Meta's Delivery-System — mindestens 5.000 anstreben.",
  "Lookalike Audiences von bestehenden Abschlüssen (1%) liefern im Schnitt 40% niedrigere CPLs als kalte Interessen.",
  "Creative-Fatigue tritt bei Meta im Schnitt nach 7–14 Tagen ein. Frequency über 3.0: neues Creative rein.",
  "Der optimale Posting-Zeitraum für Versicherungs-Ads: Di–Do, 18–21 Uhr. Wochenende kostet 20% mehr CPM.",
  "Leads die innerhalb von 5 Minuten angerufen werden, konvertieren 9x häufiger als Leads nach 30+ Minuten.",
  "Die beste Eröffnung im Cold Call: voller Name + Firma + eine direkte Frage. Kein 'Störe ich gerade?'",
  "Eine Terminquote über 20% gilt in der Versicherungsbranche als Top-Performance — darunter Qualität der Leads prüfen.",
  "Show-up Raten steigen um 40% wenn der Setter 24h vorher eine persönliche WhatsApp schickt statt automatisch.",
  "Die besten Closer stellen im Schnitt 17 Fragen pro Gespräch — schlechte Closer nur 7.",
  "Einwand 'Ich muss das nochmal überlegen' bedeutet in 90% der Fälle: der Schmerz wurde nicht tief genug herausgearbeitet.",
  "Das Gespräch gewinnt nicht der, der am meisten redet — sondern der, der am besten zuhört.",
  "'Nein' im Verkauf bedeutet meistens 'Noch nicht'. Durchschnittlich braucht es 5 Touchpoints bis zum Ja.",
  "Headlines mit Zahlen performen 36% besser als Headlines ohne — das Gehirn entscheidet in 0,3 Sekunden.",
  "Problem-Aware Hooks erzielen 2,3x höhere CTRs als Solution-Aware Hooks — teste immer beide Funnel-Stufen.",
  "Social Proof erhöht Conversion Rates um bis zu 270%. Echte Testimonials direkt in die Ad-Copy integrieren.",
  "Landing Pages mit einem einzigen CTA konvertieren 266% besser als Pages mit mehreren Optionen.",
  "E-Mail-Betreffzeilen mit 6–10 Wörtern haben die höchste Öffnungsrate — nicht zu kurz, nicht zu lang.",
  "Das Paradox of Choice: Mehr Auswahl = weniger Kaufentscheidungen. Weniger Optionen = mehr Abschlüsse.",
  "Ein Upsell kostet 5x weniger als ein Neukunde. Jeder aktive Kunde ist dein günstigster Vertriebskanal.",
  "Kunden die in den ersten 48h ongeboardet werden, haben 67% höhere Retention nach 3 Monaten.",
  "NPS unter 7: Churn-Risiko. NPS 8–9: zufrieden aber nicht loyal. NPS 10: aktiver Empfehler.",
  "Empfehlungen schließen mit 4x höherer Rate als Kaltakquise — systematisch danach fragen.",
  "Ampel Rot bedeutet: sofort handeln. Jeder Tag ohne Lösung erhöht Churn-Wahrscheinlichkeit um ~3%.",
  "MRR ist die wichtigste Metrik einer Agentur — Einmalprojekte geben Sicherheit, Retainer geben Freiheit.",
  "Die Regel der 40: Wachstumsrate + Gewinnmarge sollte ≥ 40% sein. Darunter: Strategie überdenken.",
  "Cashflow ist nicht dasselbe wie Gewinn. Eine profitable Agentur kann trotzdem an Liquidität sterben.",
  "Preise erhöhen ist der schnellste Hebel für mehr Gewinn — 10% mehr Preis = oft 30-50% mehr Gewinn.",
  "Das Parkinson'sche Gesetz gilt auch für Budgets: Ausgaben wachsen auf das verfügbare Budget — Limits setzen.",
  "Deep Work in Blöcken von 90 Minuten ist produktiver als 8 Stunden mit ständigen Unterbrechungen.",
  "Ein klares 'Nein' sagt dir mehr als ein halbherziges 'Ja'. Entscheidungsqualität schlägt Entscheidungsgeschwindigkeit.",
  "Systeme schlagen Willenskraft — wer auf Disziplin angewiesen ist, hat kein gutes System.",
  "Feedback sollte immer konkret, zeitnah und verhaltensorientiert sein — nicht personenbezogen.",
  "Die 2-Minuten-Regel: Wenn eine Aufgabe unter 2 Minuten dauert, sofort erledigen — nicht aufschreiben.",
  "Meetingkultur: Kein Meeting ohne Agenda, kein Meeting ohne Ergebnis — alles andere ist Zeitverschwendung.",
  "Beihilfe-PKV Zielgruppe: Beamte 28–45 reagieren 2,4x stärker auf Sicherheits-Hooks als auf Preis-Hooks.",
  "BU-Versicherung: Das häufigste Ablehnungsargument 'Ich bin gesund' — Antwort: 'Genau deshalb jetzt abschließen.'",
  "TKV-Leads haben die höchste Emotionalität im Abschluss — Haustiere sind Familienmitglieder, nicht Konsumgüter.",
];

const HISTORY_KEY = 'microlearning-history';

function pickUniqueLearning(): { text: string; index: number } {
  const total = microLearnings.length;
  let history: number[] = [];
  try {
    history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { history = []; }

  if (history.length >= total) {
    history = [];
  }

  const available = Array.from({ length: total }, (_, i) => i)
    .filter(i => !history.includes(i));

  const randomIndex = available[Math.floor(Math.random() * available.length)];

  history.push(randomIndex);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));

  return { text: microLearnings[randomIndex], index: randomIndex };
}

export function MicroLearning() {
  const [learning, setLearning] = useState(() => pickUniqueLearning());
  const [spinning, setSpinning] = useState(false);

  const next = useCallback(() => {
    setSpinning(true);
    setLearning(pickUniqueLearning());
    setTimeout(() => setSpinning(false), 300);
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl flex flex-col items-center justify-between h-[200px] min-h-[200px] max-h-[200px] overflow-hidden p-[18px_20px]">
      <span className="inline-block text-[10px] font-semibold px-2 py-[3px] rounded bg-primary/10 text-primary shrink-0 mb-2">
        Learning des Tages
      </span>
      <p className="text-[14px] leading-[1.6] text-foreground text-center px-2 flex-1 flex items-center overflow-hidden mb-2">
        {learning.text}
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
