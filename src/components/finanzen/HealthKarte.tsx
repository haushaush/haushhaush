import type { ReactNode } from 'react';

/** Kartenstil wie /sales/uebersicht: farbiger Punkt + Name in kleinen Großbuchstaben, große Zahl, ein Satz Klartext. */
export const HEALTH_KARTE = 'rounded-3xl bg-card p-6 shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(var(--foreground)/0.12)]';

export const FARBE = {
  primaer: 'hsl(var(--primary))',
  rot: 'hsl(var(--destructive))',
  gruen: 'hsl(var(--success))',
  grau: 'hsl(var(--muted-foreground))',
};

export function HealthKopf({ titel, farbe }: { titel: string; farbe: string }) {
  return (
    <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] font-semibold" style={{ color: farbe }}>
      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: farbe }} />{titel}
    </p>
  );
}

export function HealthKarte({ titel, farbe, wert, satz, children, className = '' }: { titel: string; farbe: string; wert?: string; satz?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`${HEALTH_KARTE} ${className}`}>
      <HealthKopf titel={titel} farbe={farbe} />
      {wert != null && <p className="text-4xl font-semibold tabular-nums tracking-tight mt-3">{wert}</p>}
      {satz && <p className="text-sm text-muted-foreground mt-1">{satz}</p>}
      {children}
    </div>
  );
}
