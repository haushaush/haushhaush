# Showcase Production-Ready: Bulk-Import & Polish

Sehr großer Scope. Ich schlage vor in **3 zusammenhängenden Lieferungen** umzusetzen, alle in einem Build-Lauf, aber technisch entkoppelt damit nichts kippt.

## Bestehende Infrastruktur (wird wiederverwendet)

- Edge: `meta-ads-list-importable` (paginiert Ads aus Meta) ✓
- Edge: `meta-ads-import-to-showcase` (importiert Selektion mit Bild-Persistierung) ✓
- Modal: `src/components/sales/MetaAdImportModal.tsx` (Single-Screen-Variante, wird ersetzt)

## Lieferung 1 — Bulk-Import-Wizard

**Neue Komponente:** `src/components/showcase/BulkImportWizard.tsx`

5 Steps mit Apple-Style StepperBar oben:

```
Quelle → Filter → Auswahl → Anreichern → Import
```

- **Quelle:** Account-Cards (aus `useMetaAds().accounts`), Click-to-select
- **Filter:** Zeitraum (Quick-Toggles 30/90/180/Jahr), Status-Radio, Min-Leads, Min-Budget. Triggert `meta-ads-list-importable` mit `datePreset` und `status`. Frontend-Filter für minLeads/minSpend
- **Auswahl:** Visuelles Grid (3-5 cols), Cards mit Thumbnail + CPL/Leads-Overlay, Checkbox-Animation. Top-Actions: "Alle / Top-Performer / Keine"
- **Anreichern:** Bulk-Apply-Card oben (Branche/Kunde/Unternehmen), darunter scrollbare Per-Ad-Tabelle mit Combobox-Override
- **Import:** Iteriert pro Ad, ruft pro Aufruf `meta-ads-import-to-showcase` mit `[adId]`. Frontend-State trackt `done/total/recent[]/errors[]` für echten Live-Progress (kein SSE nötig — single-ad-calls geben Real-Time-Feedback und nutzen die bestehende Edge ohne Änderung)
- **Done:** Erfolgs-Card + Fehler-Liste, Close-Button mit Refresh-Callback

**Trigger:** Replace bestehenden "Importieren"-Button auf `ReferenzWerbeanzeigen.tsx` mit dem neuen Wizard. Alter `MetaAdImportModal` bleibt vorerst als Fallback (nicht gelöscht).

## Lieferung 2 — Empty-States & Onboarding-Hint

**Neue Komponente:** `src/components/showcase/EmptyState.tsx` (icon-circle + title + description + action)

Eingesetzt auf:
- `ReferenzShowcaseOverview.tsx` (0 items) → Onboarding-Hint-Card mit 3-Step Erklärung + 2 CTAs
- `ReferenzWerbeanzeigen.tsx` (0 items) → "Keine Anzeigen importiert" + Bulk-Import-CTA
- `ReferenzWebsites.tsx` (0 items) → "Noch keine Websites" + Add-CTA
- Filter-leer Cases: "Nichts gefunden" + Reset-Button

## Lieferung 3 — AddWebsiteModal Refresh

Bestehendes `AddWebsiteModal.tsx` → 2-Step-Flow:
- **Step 1 (URL):** URL-Input + Auto-Screenshot-Preview, "Weiter"-Button
- **Step 2 (Details):** Titel, Kunde, Branche, Highlights, Beschreibung, Tags

Header zeigt "Schritt X von 2", Footer hat Back/Next/Save. Alle bestehenden Felder bleiben — nur in 2 Screens aufgeteilt.

## Bewusst NICHT enthalten (Scope-Empfehlung)

1. **SSE-Streaming-Edge-Function:** Nicht nötig. Iterative Single-Ad-Calls aus dem Frontend liefern echtes Live-Feedback ohne neue Edge-Function-Komplexität (kein neuer Code in Supabase, keine Auth-Edge-Cases, kein Timeout-Risk). Falls später echte Server-Streams gewünscht: separate Phase.
2. **Audit-Log RPC `log_audit`:** Keine Tabelle in der DB sichtbar — würde fehlschlagen. Skippen oder später einbauen wenn Audit-System steht.
3. **`<Combobox>` mit `compact` prop / Branchen-/Kunden-/Unternehmens-Optionen:** Nutze bestehende `Combobox`-Komponente + `useLookups`/Close-Deals-Query.

## Geänderte/Neue Dateien

```
NEU:
  src/components/showcase/BulkImportWizard.tsx     (~600 LoC, 6 Sub-Komponenten in einer Datei)
  src/components/showcase/EmptyState.tsx           (~40 LoC)

GEÄNDERT:
  src/pages/sales/ReferenzWerbeanzeigen.tsx        (Wizard einbinden, Empty-State)
  src/pages/sales/ReferenzWebsites.tsx             (Empty-State)
  src/pages/sales/ReferenzShowcaseOverview.tsx     (Onboarding-Hint + Empty-State)
  src/components/sales/AddWebsiteModal.tsx         (2-Step-Flow Wrapper, Felder unverändert)
```

## Reihenfolge

1. EmptyState-Primitive
2. BulkImportWizard mit allen Steps
3. AddWebsiteModal 2-Step-Refactor
4. Pages-Integration + Onboarding-Hint

## Bestätigungen

- OK so umzusetzen ohne SSE-Edge-Function?
- OK den alten `MetaAdImportModal` zu behalten (nicht löschen) als Fallback?
- Auto-Screenshot im AddWebsite-Step1: bestehende Logik verwenden (du hattest dort schon Thumbnail-Generation)?
