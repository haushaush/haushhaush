# Kunden-Detailseite: Verknüpfungen, erklärte Kacheln, Stammdaten, Sammelansicht

## Ausgangslage
Fast alles auf der Detailseite hängt an der Close-Verknüpfung (`close_link`). Fehlt sie, zeigen Kacheln und Tabs nur 0 / „—“. Vorhandene Verknüpfungs-Speicher im Projekt:

| System | Speicher heute | Status |
|---|---|---|
| Close (Lead) | `close_link`, `kunde_close_deals` | angebunden |
| Meta Ads (Werbekonto) | `kunde_meta_accounts` | angebunden |
| Qonto (Gegenpartei) | `qonto_client_links` | angebunden |
| Onepage (Website) | `onepage_projects.client_id_fk` | angebunden |
| Pipedrive | `pipedrive_*` (kein Kunden-Link) | angebunden, Link fehlt |
| Slack (Channel) | `slack-channels`-Funktion, kein Kunden-Link | angebunden, Link fehlt |
| Google Drive (Ordner) | `drive_folder_mappings` | angebunden |
| Superchat | nichts | nicht angebunden (grau) |

## Phase 1 — Tab „Verknüpfungen“
- Neuer Tab mit Kopfzeile „X von 8 Systemen verknüpft · Y Vorschläge offen“.
- Eine Zeile je System: System · Status · verknüpftes Objekt (Name + ID + Link ins Zielsystem) · Aktion.
- Drei Zustände: Verknüpft („Verknüpfung lösen“ mit Bestätigung), Vorschlag (Begründung, z. B. „Treffer über Firmennamen · 2 Zahlungen“, „Übernehmen“/„Verwerfen“), Nicht verknüpft (Suchfeld im Zielsystem).
- Vorschläge: bestehende Bausteine wiederverwenden — `search-close-suggestions` (Close), `match-meta-accounts`/`ManualMetaLinkModal` (Meta), `qonto_client_link_suggestions` (Qonto). Neu nur für Onepage/Drive/Slack: Namens- und Domain-Abgleich. Immer mit Trefferweg; nie automatisch verknüpfen.
- Neue Tabelle `kunde_link_vorschlag_verworfen` (client_id, system, externe_id, verworfen_von, verworfen_am) — „Verwerfen“ blendet dauerhaft aus.
- Neue Tabelle `kunde_externe_links` (client_id, system, externe_id, name) für Slack-Channel und Pipedrive, wo es heute keinen Speicher gibt. Bestehende Speicher bleiben die Quelle für ihre Systeme.

## Phase 2 — Keine toten Kacheln
- Gemeinsamer Helfer `leerGrund(system, verknuepft, anzahl)` liefert je Kachel/Tab: „Kein Close-Lead verknüpft · Jetzt verknüpfen“ (springt in den Tab) bzw. „Verknüpft, keine Deals vorhanden“.
- Gilt für Deals, Gesamtwert, Ads-Budget, Cash Collect, aktive Projekte, alle Tab-Inhalte.
- Badge oben: „Close: nicht verknüpft“ nur ohne Link; sonst „Close: zuletzt synchronisiert vor 3 Tagen“ bzw. „Sync fehlgeschlagen am …“ mit Knopf „Jetzt synchronisieren“ (ruft `sync-close-lead-full`).

## Phase 3 — Stammdaten aus Close
- `sync-close-lead-full` schreibt Name, Kontakt (Vor-/Nachname, E-Mail, Telefon), Website, Branche, Unternehmen in neue Spalten `close_stammdaten` (jsonb, Close-Rohwerte) am Kunden. Leere Close-Felder bleiben leer.
- Anzeige je Feld mit Quelle („aus Close“ / „im CRM geändert“). Weicht der CRM-Wert vom Close-Wert ab: dezentes Hinweis-Symbol mit dem Close-Wert im Tooltip. Close bleibt führend; nichts wird nach Close zurückgeschrieben.

## Phase 4 — Sammelansicht
- Neue Seite „Verknüpfungen prüfen“ unter Kunden: aktive Kunden (dieselbe Liste wie Laufzeiten), Spalten je System mit Haken/Kreuz, sortiert nach Anzahl der Lücken, Klick öffnet den Verknüpfungen-Tab des Kunden.
- Knopf „Alle Vorschläge prüfen“: alle offenen Vorschläge nacheinander, Annehmen / Verwerfen / Überspringen.

## Leitplanken
- Keine automatische Verknüpfung ohne Klick, keine bestehende Verknüpfung wird gelöscht außer per „Verknüpfung lösen“ mit Bestätigung.
- Superchat erscheint als „nicht angebunden“, bis es eine Anbindung gibt.

## Annahmen (bitte korrigieren)
- Slack- und Pipedrive-Verknüpfungen werden neu im CRM gespeichert (bisher gibt es keine Zuordnung Kunde ↔ Channel/Deal).
- Für Drive wird pro Kunde ein Ordner verknüpft (`drive_folder_mappings`).
- Umsetzung in Reihenfolge 1 → 2 → 3 → 4, jeweils mit Browserprüfung.
