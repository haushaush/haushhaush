# Sprint: Zentrale Personen-Datenbank über `clients`

## Erkannte Konflikte mit dem aktuellen Schema (vor Umsetzung wichtig)

1. **`unternehmen` existiert bereits** (Legacy, 85 rows) mit Spalten `name, display_name, branche_id, usage_count` und passender RPC `increment_unternehmen_usage`. Plan-Teil 1.2 (`CREATE TABLE unternehmen`) entfällt — wir **nutzen die existierende Tabelle**. `create_or_get_unternehmen` wird als dünner Wrapper um die existierende RPC angelegt (signatur-kompatibel zum Plan).
2. **`branches` + `companies` neu** (aus Sprint vor 2 Iterationen, 18/29 rows) sowie `close_deals.branch_id`/`company_id` bleiben **unbenutzt** liegen — Branche ist laut Plan ein TEXT-Enum (BRANCHEN const), nicht FK. Wir lassen die Tabellen drin, schreiben aber nicht hinein. Keine Drops in diesem Sprint.
3. **`close_deals.branche` ist `ARRAY`**, nicht `text`. Backfill 2.7 für close_deals nutzt `art` (text) statt `branche`, passt also bereits.
4. **`close_deals.unternehmen` (text)** existiert — wird zusätzlich zu `art` als Quelle für Unternehmen-Backfill genutzt.
5. **`onepage_projects.client_id`** ist bereits UUID — 2.9 Logik passt.
6. **RLS-Policy für `unternehmen`** entfällt (existiert schon). Falls fehlt: nachrüsten.

## Vorgehen (Phasen-weise — pro Phase commit-fähig)

### Phase A — DB Foundation (Teile 1–3, ein Migration-Call)
- `ALTER TABLE clients` + Indexes (1.1)
- Skip 1.2 (`unternehmen` existiert)
- 1.4 FK-Spalten auf `referenz_websites`, `referenz_meta_ads`, `referenz_meta_campaigns`, `close_deals`, `onepage_projects` (Plan-Naming `linked_client_id`, `client_id`, `client_id_fk`, `linked_branche_id`, `linked_unternehmen_id`)
- 1.5 Indexes
- 2.1–2.9 Backfill (siehe Anmerkungen unten)
- 3.1 `create_or_get_unternehmen` (Wrapper um `increment_unternehmen_usage` mit display_name), 3.2 `find_client_by_meta_account`

Anmerkungen Backfill:
- 2.1: Quellen erweitern um `close_deals.unternehmen`
- 2.2: Endkunden aus `close_deals` in `clients` einfügen, dedupe per lower(trim(name)). `kundenstatus` = `'Lead'` (Enum-Wert prüfen; falls nicht vorhanden, NULL lassen)
- 2.7: `close_deals.branche_id` zusätzlich aus erstem Element des `branche` ARRAY ableiten

### Phase B — Generic Combobox + 3 Picker (Teil 4)
- `src/components/ui/Combobox.tsx` existiert bereits und ist generisch + create-fähig — **wiederverwenden statt neu**.
- Neu anlegen:
  - `src/components/pickers/ClientPicker.tsx` (Query: `clients` + join `unternehmen`)
  - `src/components/pickers/BranchePicker.tsx` (statisch aus `src/lib/branchen.ts`)
  - `src/components/pickers/UnternehmenPicker.tsx` (RPC `create_or_get_unternehmen`)
- `getBrancheLabel()` aus `src/lib/branchen.ts` nutzen (falls fehlt: ergänzen)

### Phase C — Forms umstellen (Teil 5)
Alle in Teil 5 aufgelisteten Files: Text-Inputs/Selects durch die 3 Picker ersetzen, Save-Payload schreibt nur noch `linked_client_id` / `linked_branche_id` / `linked_unternehmen_id` (Legacy-Felder bleiben unverändert wenn schon gesetzt, werden aber nicht mehr aktiv geschrieben).

### Phase D — Display + Filter-Optionen (Teile 6 + 7)
- Alle Cards/Detail-Panels: JOIN-Queries mit `linked_client:clients!linked_client_id(...)` und `linked_unternehmen:unternehmen!linked_unternehmen_id(...)`
- Legacy-Fallback-Pattern beim Render (`item.linked_client?.name || item.client_name || …`)
- `useShowcaseFilterOptions` und Filter-Toolbars auf FK-basierte unique-Counts umstellen → entfernt Marvin-Rixen-Duplikat-Problem

### Phase E — Edge Function (Teil 8)
- `supabase/functions/rematch-all-ads/index.ts` schreibt `linked_client_id` (statt `linked_kunde_id`!), `linked_branche_id`, `linked_unternehmen_id`. Branche-Alias-Map in Function dupliziert (oder shared helper).
- **Achtung**: Function nutzt aktuell `linked_kunde_id` und `kunde_meta_accounts` Link-Tabelle. Wir behalten den Link-Mechanismus, mappen aber zusätzlich auf `clients.id` über `find_client_by_meta_account`.

### Phase F — Verifizierung (Teil 9)
SQL-Checks 1–4 + UI-Walkthrough für AddWebsiteModal, Werbeanzeigen-Filter, CloseDealDetail.

## Empfohlene Ausführungs-Reihenfolge

Ich empfehle **Phase A jetzt als einzelnen Migration-Call**, dann nach Approval B–F in einem Build-Loop. Das gibt dir einen sicheren Rollback-Punkt nach der Migration.

## Was NICHT gemacht wird
- Keine Drops alter Spalten (laut Spec)
- Keine Drops von `branches`/`companies` Tabellen (separater Cleanup-Sprint)
- Keine Änderung an `kunde_meta_accounts` Link-Tabelle
- Keine Auth/RLS-Änderungen außer für neu hinzugefügte Spalten

## Offene Punkte zur Bestätigung

1. **`clients.kundenstatus` Enum**: gibt es Wert `'Lead'`? Wenn nein → für Endkunden-Import NULL nehmen.
2. **Bestehende `referenz_meta_ads.linked_kunde_id`** Spalte: laut existing edge function existiert sie. Behalten wir als zweiten Slot oder benennen um zu `linked_client_id`? Empfehlung: **neue Spalte `linked_client_id` zusätzlich**, alte bleibt Legacy.
3. Phase B–F sollen in **einem** Folge-Loop oder einzeln laufen?
