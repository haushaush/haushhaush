# Apple-Style Design-System Refactor

Ziel: Single source of truth für Tokens, Cards, Page-Shell, Headers und Buttons. Alle 7 Showcase-Pages auf dieses System migrieren.

## Scope

**Foundation-Files (neu):**
- `src/styles/tokens.ts` — Radius/Spacing/Shadow/Typography/Motion-Tokens
- `src/styles/colors.ts` — semantische Color-Klassen (surface/border/text/accent)
- `src/components/ui/SurfaceCard.tsx` — primitive Card (Name `SurfaceCard` um Kollision mit shadcn `Card` zu vermeiden)
- `src/components/layout/PageShell.tsx` — Page-Container mit max-width
- `src/components/layout/PageHeader.tsx` — einheitlicher Header (size lg/xl, breadcrumb, actions)

**Tailwind-Config:**
- `tailwind.config.ts`: borderRadius + boxShadow aus tokens importieren (additiv, ohne shadcn semantic tokens zu zerstören)

**Button-System:**
- `src/components/ui/button.tsx` erweitern: zusätzliche Varianten `accent`, neue Size-Skala kompatibel halten (bestehende `default/sm/lg/icon` bleiben für Rückwärtskompatibilität, neue `accent`-Variant ergänzt). Keine Breaking-Changes für Rest der App.

**Migration der 7 Showcase-Pages:**
1. `src/pages/sales/ReferenzShowcaseOverview.tsx` — Hauptseite, PageHeader size=xl
2. `src/pages/sales/ReferenzWebsites.tsx` — Sub-Page, size=lg
3. `src/pages/sales/ReferenzWerbeanzeigen.tsx` — Sub-Page, size=lg
4. `src/pages/sales/AdPerformance.tsx` — Sub-Page, size=lg
5. `src/pages/sales/ReferenzWebsiteDetail.tsx` — Detail
6. `src/pages/sales/ReferenzWerbeanzeigeDetail.tsx` — Detail
7. `src/pages/sales/AdPerformanceDetail.tsx` — Detail

Pro Page:
- Eigenen Page-Container durch `<PageShell>` ersetzen
- Eigene Header-Section durch `<PageHeader>` ersetzen
- `rounded-xl/2xl/3xl + border + bg-white` Container durch `<SurfaceCard>` ersetzen
- Card-Komponenten in `ReferenzShowcaseUI.tsx` (ShowcaseCard/AdCreativeCard/WebsiteCard/CampaignCard) auf `<SurfaceCard interactive>` umstellen — gleiche visuelle Tokens, nur einheitliche Basis

**Außerhalb Scope (NICHT angefasst):**
- shadcn UI-Primitives (`src/components/ui/card.tsx` etc.) — bleiben für Rest der App
- Andere Pages (Dashboard, CRM, Finanzen, Meta) — kein Mass-Replace außerhalb Showcase
- `index.css` semantic tokens — unverändert

## Technische Details

### tokens.ts → tailwind.config.ts
Nur `borderRadius` und `boxShadow` werden in Tailwind injected. Spacing/Typography/Motion-Tokens sind String-Helper für direkten Import in Komponenten (keine Tailwind-Override, um shadcn nicht zu brechen).

### SurfaceCard
```tsx
<SurfaceCard padding="md" interactive href="/foo">…</SurfaceCard>
```
- default: `rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm`
- interactive: `+ hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ease-out`
- padding presets: none/sm(p-4)/md(p-5)/lg(p-8)
- as: ElementType (default `div`, oder `'a'`/`Link`)

### PageHeader
- size `xl`: `text-4xl md:text-5xl`, mehr vertical-spacing
- size `lg`: `text-2xl md:text-3xl`
- Optional: 1 Breadcrumb, Description, Actions-Slot rechts

### PageShell
`min-h-screen bg-[#fafaf7] dark:bg-gray-950` + `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8`

### Button-Erweiterung
Neue Variant `accent` (teal). Bestehende `default` bleibt unverändert. Bestehende Verwendungen brechen nicht.

## Test
1. Build grün
2. Alle 7 Showcase-Pages laden, gleiche Header-Höhe-Skala
3. Cards überall gleich rund (rounded-2xl), gleicher Border, gleicher Shadow
4. Hover-Lift konsistent
5. Dark-Mode überall gleich
6. Andere Pages (Dashboard etc.) unverändert