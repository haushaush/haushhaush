# Bonus-Cockpit — Stufe 1: Datenmodell, Rechte, Seitengerüst

Ziel dieser Stufe: Tabellen, Berechtigungen und ein leeres, geschütztes Seitengerüst unter `/hr/bonus`. Keine Berechnungslogik, keine Syncs, keine Umfrageseite.

## Antworten auf die vier Fragen

**1. Überschneidungen mit bestehenden Tabellen?**
Keine echten Kollisionen, aber drei Punkte:
- `salary_payments` (member_id, monat, betrag_brutto/netto, status, ueberwiesen_am) ist die Auszahlungsebene. `bonus_monate` ist die Berechnungsebene. Sinnvoll: `bonus_monate` bleibt eigenständig, später optional eine Referenz auf die Auszahlung — nicht in Stufe 1.
- `team_hr_data` enthält Stammdaten (Steuer, Bank), keine Leistungsdaten — keine Überschneidung.
- `time_off_requests` und `daily_checkins` überschneiden sich thematisch mit `bonus_abwesenheit`. Empfehlung: `bonus_abwesenheit` trotzdem als eigene Tabelle führen (bonusrelevante, manuell festgestellte zusammenhängende Fehltage), aber ohne Anspruch, Abwesenheiten allgemein abzubilden. Später kann eine Vorbefüllung aus `time_off_requests` ergänzt werden.
- Wichtig: `team` hat **keine** Spalte mit der Auth-User-ID. Die Verknüpfung läuft heute über die E-Mail (`team_with_auth_ids()` joint `auth.users.email = team.email`). Das ist für RLS relevant (siehe unten).

**2. Stabile Kundenreferenz für Snapshots**
`clients.id` (uuid). `close_leads.client_id` zeigt auf `clients.id`, ebenso `close_activities.client_id` und `qonto_client_invoices.client_id`. Die Close-Lead-ID (`close_leads.id`, text) ist die externe Referenz, aber nicht überall gesetzt. Deshalb: alle `bonus_*`-Tabellen referenzieren `clients.id`; Close-IDs werden nur als zusätzliche Textspalten für Idempotenz mitgeführt (`close_activity_id`, `close_opportunity_id`).

**3. Qonto-Zuordnung wiederverwendbar?**
Ja, teilweise. `qonto_client_links` (115 verknüpfte Einträge) mappt Qonto-Kundennamen auf `clients.id`, und `qonto_client_invoices` hat bereits `client_id`. Es gibt dafür auch fertige Funktionen (`get_client_qonto_open_invoices`, `get_client_qonto_finance_summary`, `qonto_auto_link_clients`).
Aber: Zahlungs*eingänge* liegen in `qonto_transactions_new` (transaction_id, amount, side, settled_at, label) — dort gibt es **keine** Kundenzuordnung. Für „Cash Collect tatsächlich eingegangen" ist also weiterhin eine Zuordnungsebene nötig. Deshalb bleibt `bonus_cash_collect` wie geplant bestehen, nutzt aber `qonto_transaction_id` als Idempotenzschlüssel und wird später über `qonto_client_invoices.paid_at` + `qonto_client_links` vorbefüllt statt neu gematcht.

**4. Cron**
`pg_cron` und `pg_net` sind aktiv, aktuell laufen 10 Jobs (z. B. `qonto-sync-daily-6am` `0 6 * * *`, `meta-status-check-hourly`). Neue Zeitsteuerung erfolgt genauso: `cron.schedule` + `net.http_post` auf die Edge Function. In Stufe 1 wird noch kein Job angelegt.

## Warum die Umfrage nicht über anon-RLS läuft

Ein anon-INSERT-Recht auf `bonus_survey_antworten` würde bedeuten, dass die Rolle `anon` Schreibzugriff auf eine gehaltsrelevante Tabelle hat und über `bonus_survey_tokens` Token erraten oder auflisten könnte. Stattdessen: keinerlei `anon`-GRANT auf `bonus_*`. Die öffentliche Umfrageseite spricht ausschließlich eine Edge Function an, die mit Service-Role läuft und selbst prüft: Token existiert, gehört zum Monat, ist noch nicht ausgefüllt, Werte 1–5. Damit ist die Schreibregel serverseitig erzwungen und nicht durch eine Policy-Formulierung umgehbar. Die Edge Function selbst wird erst in Stufe 2 gebaut — Stufe 1 legt nur die Tabellen ohne anon-Zugriff an.

## Umsetzung Stufe 1

### Migration (eine, in dieser Reihenfolge je Tabelle: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY)

Enums: `bonus_kanal`, `bonus_cash_quelle`, `bonus_churn_typ`, `bonus_monat_status`.

Tabellen wie spezifiziert: `bonus_mitarbeiter`, `bonus_config`, `bonus_kunden_snapshot`, `bonus_survey_tokens`, `bonus_survey_antworten`, `bonus_cash_collect`, `bonus_checkins`, `bonus_churn_events`, `bonus_upsells`, `bonus_upsell_zahlungen`, `bonus_abwesenheit`, `bonus_monate` — inklusive der genannten Unique-Constraints (u. a. partieller Unique-Index auf `qonto_transaction_id` where not null) und `updated_at`-Trigger über die vorhandene `update_updated_at_column()`.

Zwei Helper-Funktionen (SECURITY DEFINER, `set search_path = public`), da `team` keine Auth-ID-Spalte hat:
- `bonus_my_team_id()` → `team.id` des eingeloggten Nutzers, ermittelt über `lower(auth.users.email) = lower(team.email)`
- `bonus_can_manage()` → `is_admin() OR user_has_permission(auth.uid(), 'hr.bonus.manage')`

Grants: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated;` `GRANT ALL ... TO service_role;` **kein** `anon`.

Policies je Tabelle:
- Lesen: `bonus_can_manage()` OR `mitarbeiter_id = bonus_my_team_id()` (bei Tabellen ohne `mitarbeiter_id` — `bonus_config`, `bonus_upsell_zahlungen`, `bonus_survey_antworten` — über den Join auf die übergeordnete Zeile).
- Schreiben/Ändern/Löschen: ausschließlich `bonus_can_manage()`.

### Permissions
Zwei Zeilen in `app_permissions` (Kategorie „HR"): `hr.bonus.view`, `hr.bonus.manage`; per Daten-Insert nach der Migration, plus Zuweisung von `hr.bonus.manage` an die Admin-Rolle in `role_permissions`.

### Frontend
- `src/pages/hr/BonusCockpit.tsx`: `PageShell` + `PageHeader` („Bonus-Cockpit", Untertitel), darunter ein Platzhalterbereich mit Hinweis, dass die Auswertung in der nächsten Stufe folgt. Keine Datenabfragen.
- Route in `src/App.tsx`: `/hr/bonus` in `<DL>` innerhalb `<PermissionRoute permissionKey="hr.bonus.view">`.
- Sidebar-Eintrag unter der HR-Gruppe, sichtbar über denselben Permission-Key.

### Nicht in dieser Stufe
Survey-Edge-Function und öffentliche Umfrageseite, Qonto-/Close-Vorbefüllung, Punkteberechnung, Freigabe-Workflow, Cron-Jobs, Konfigurations-UI.
