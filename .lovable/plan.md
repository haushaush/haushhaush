## Ziel
Zentrale `branchen`-Tabelle in Supabase als Single Source of Truth für alle Branche-Dropdowns.

## Wichtige Befunde aus Codebase-Check

1. **Tabelle `branchen` existiert bereits** (Spalten: `id, name, display_name, display_order, usage_count`) mit ~Kurzformen wie `PKV`, `BU`, `KFZ`. Sie muss erweitert werden, nicht neu erstellt.
2. **Spalte heißt `clients.branche`** (TEXT), nicht `clients.sparte`. Ich nehme `branche`.
3. **`BranchePicker` (Kunden-Bearbeiten)** liest aktuell aus der statischen Liste `BRANCHEN` in `src/lib/branchen.ts` und speichert in `clients.branche_id` (ein String-Key wie `"pkv"`). Das ist ein **anderes System** als die neue `branchen`-Tabelle mit Canonical-Texten.

## Frage zur Entscheidung (Task 5D — Kunde-Bearbeiten)

Im Kunde-Bearbeiten-Modal wird aktuell `branche_id` (Key wie `"pkv"`) gespeichert, nicht `branche` (Text). Soll ich:
- **(A)** Das Bearbeiten-Feld auf die neue `branchen`-Tabelle umstellen → schreibt dann in `clients.branche` (TEXT) statt `branche_id`. Konsistent mit anderen Dropdowns, aber bricht den `branche_id`-basierten Display-Path in KundenDetail.
- **(B)** `BranchePicker` für Kunden unverändert lassen (er ist ein anderes System), nur Filter / Werbeanzeigen-Detail / Zuordnen-Modal umstellen.

Bitte (A) oder (B) bestätigen — ich gehe sonst mit **(B)** weiter (minimal-invasiv, sicherer).

## Migrationen

```sql
ALTER TABLE public.branchen
  ADD COLUMN IF NOT EXISTS canonical_name TEXT,
  ADD COLUMN IF NOT EXISTS short_name TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Backfill canonical_name aus display_name
UPDATE public.branchen SET canonical_name = display_name WHERE canonical_name IS NULL;
ALTER TABLE public.branchen ALTER COLUMN canonical_name SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_branchen_canonical_unique
  ON public.branchen (lower(canonical_name)) WHERE deleted_at IS NULL;

-- Policies: UPDATE + soft-DELETE für authenticated
CREATE POLICY "Authenticated update branchen" ON public.branchen
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed: alle Canonicals aus BRANCHE_ALIASES
INSERT INTO public.branchen (name, display_name, canonical_name, short_name)
VALUES ('Private Krankenversicherung','Private Krankenversicherung','Private Krankenversicherung','PKV'),
       ... (alle 13)
ON CONFLICT DO NOTHING;

-- Distinct aus clients.branche, die noch nicht da sind
INSERT INTO public.branchen (name, display_name, canonical_name)
SELECT DISTINCT trim(branche), trim(branche), trim(branche) FROM public.clients
WHERE branche IS NOT NULL AND trim(branche) <> ''
  AND lower(trim(branche)) NOT IN (SELECT lower(canonical_name) FROM public.branchen WHERE deleted_at IS NULL)
ON CONFLICT DO NOTHING;
```

## Neue / geänderte Dateien

- **NEU** `src/hooks/useBranchen.ts` — React Query Hook, lädt `id, canonical_name, short_name`.
- **EDIT** `src/components/sales/AddBrancheDialog.tsx` — schreibt in `branchen`-Tabelle, neues Feld `short_name`, Kunden-Zuweisung optional.
- **EDIT** `src/components/sales/ZuordnenAccountsModal.tsx` — `brancheOptions` mergen mit `useBranchen()`-Daten.
- **EDIT** `src/pages/sales/ReferenzWerbeanzeigen.tsx` — Filter-Optionen mit `useBranchen()` mergen (0-Counts bleiben sichtbar).
- **EDIT** `src/pages/sales/ReferenzWerbeanzeigeDetail.tsx` — Branche-Inline-Combobox aus `useBranchen()` füllen.
- **(B-Pfad)** Kunden-Bearbeiten bleibt unverändert.

## Nicht enthalten
- Keine FK auf `clients.branche` / `referenz_meta_ads.branche`.
- `branche-aliases.ts` bleibt für Alias-Folding.
- Task 8 (Branchen-Verwalten-UI) wird ausgelassen (separater Sprint).
