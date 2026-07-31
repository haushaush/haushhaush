# Briefing: Haush Haush CRM — Funktionsweise (für Claude)

> Zweck: Dieses Dokument gibt Claude (oder einem anderen LLM/Agenten) das vollständige
> mentale Modell des Systems: Architektur, Datenmodell, Module, Integrationen,
> Rechte-Logik und Konventionen. Stand: Juli 2026.

---

## 1. Was ist das System?

Ein internes Agentur-CRM/Dashboard („Haush Haush Dashboard") für eine
Performance-Marketing-Agentur. Es bündelt:

- **Kundenverwaltung** (aus Close CRM synchronisiert)
- **Paid-Ads-Steuerung** (Meta Ads: Kampagnen, Anzeigen, Leads, Reportings, Abrechnungen)
- **Finanzen** (Qonto-Banking, Werbebudgets, Rechnungen)
- **Sales-Referenzen / Showcase** (öffentlich teilbare Referenzgalerie)
- **HR & Team** (Mitarbeiter, Zeiterfassung, Check-ins, Rollen & Rechte)
- **Automatisierung** (n8n, Slack, E-Mail-Regeln, ARIA-KI-Assistent)

Sprache der UI und der Datenfelder: **Deutsch**. Fachbegriffe wie „Kunden",
„Anzeigen", „Verknüpfungen", „Abrechnungen" sind Teil des Domänenvokabulars.

---

## 2. Technische Architektur

| Ebene | Technologie |
| --- | --- |
| Frontend | React 18 + Vite 5 + TypeScript + Tailwind CSS 3 + shadcn/ui |
| Routing | react-router-dom (alle Routen in `src/App.tsx`) |
| State/Fetching | React Query, Context-Provider (`AuthContext`, `ARIAContext`, `ErrorContext`, `MetaAdsContext`, `MusicPlayerContext`) |
| Backend | Lovable Cloud (Supabase): Postgres + Auth + Storage + Edge Functions (Deno) |
| Externe APIs | Meta Graph API, Close CRM, Qonto, Slack, Google Drive/Gmail, Notion, Figma, n8n, Pipedrive, OnePage |

**Wichtig:** Es gibt keinen eigenen App-Server. Jede Server-Logik läuft als
Supabase Edge Function unter `supabase/functions/<name>/index.ts`. Externe
API-Keys liegen ausschließlich als Secrets in den Edge Functions — nie im Client.

### Frontend-Konventionen

- Client-Import: `import { supabase } from "@/integrations/supabase/client"`
- Design: Sora-Font, `tabular-nums` für Zahlen, minimalistisch (Grautöne/Outlines)
- Zahlenformatierung: globales `formatValue`-Utility (≥640px: `€21.000`, <640px: `21K €`)
- Z-Index-Hierarchie: Glow (90) → ARIA (150/160) → Sticky (200) → Modals (400) → Toasts (500)
- Layout-Bausteine: `DashboardLayout` (`DL`) + `PageShell` + `PageHeader`
- Edge-Function-CORS: Header werden **manuell** gesetzt (`Access-Control-Allow-Origin: *`)

---

## 3. Auth, Rollen & Berechtigungen

### Zugangsfluss

1. `/registrierung` bzw. `/register` — Mitarbeiter registriert sich
2. Eintrag landet in `employee_requests`, Status in `user_access_status`
3. **Admin muss manuell freischalten** — keine anonymen Anmeldungen
4. `/onboarding` für Profilvervollständigung
5. `MfaGate` erzwingt 2FA

### 2FA-Regeln

- 2FA ist **Pflicht** für alle Nutzer.
- Ausnahme über Spalte `two_factor_exempt` — nur Admins können ausnehmen
  (Edge Function `admin-set-mfa-exempt`).
- Mitarbeiter dürfen ihre eigene 2FA **nicht** deaktivieren. Admins können 2FA nur
  für *andere* Nutzer deaktivieren, nicht für sich selbst.
- Recovery-Codes: `mfa_recovery_codes`, vertraute Geräte: `mfa_trusted_devices`.

### Rollen & Rechte

- Rollen liegen **getrennt** in `user_roles` (`app_role`-Enum: admin/moderator/user).
  Niemals in `profiles`/`team` (Privilege-Escalation-Schutz).
- Prüfung serverseitig über `has_role(_user_id, _role)` (SECURITY DEFINER).
- Feingranulare Seitenrechte: `app_permissions`, `role_permissions`,
  `user_permissions` — jede der ~19 Seiten ist einzeln ein-/ausblendbar.
  Die Sidebar rendert automatisch nur erlaubte Einträge.
- Route-Guards: `<AdminRoute>`, `<PermissionRoute permissionKey="...">`,
  `<ShowcaseAuthRedirect>` (öffentliche Showcase-Ansicht).
- Beispielhafte Permission-Keys: `dashboard.view`, `clients.view`,
  `clients.laufzeiten.view`, `sales.view`, `sales.meta.view`,
  `sales.referenzen.manage`, `meta.billing.view`, `drive.view`,
  `projects.view`, `tasks.view`.

---

## 4. Navigations- und Modulübersicht

Dreistufige Baumnavigation in `AppSidebar.tsx`; global: `Cmd+K` (Suche), `Cmd+J` (ARIA).

### 4.1 Dashboard (`/`)
Sortierbare Blöcke (Layout in LocalStorage, mit Reset), ARIA-Hero,
KPI-Slider (5 Slides, 4×2-Grid, feste Kartenhöhe 140px), Micro-Learning
(40 rotierende Best Practices), Zeiterfassung (fixe 200px, globale Top-Bar),
Mitteilungen-Karte (Top 5 Alerts, Realtime), Musikplayer (persistentes YouTube-iframe).

### 4.2 Kunden
- `/kunden` — Liste/Karten, `/kunden/:id` — Detailseite
- `/kunden/abschluesse`, `/kunden/laufzeiten`, `/kunden/pipeline`
- Datenquelle: Close CRM (`close_deals`, `close_leads`, `close_opportunities`,
  `close_activities`, `close_contacts`), gemappt auf `clients` bzw. `kunde_close_deals`
- KPI „Cash Collect offen": offene Qonto-Rechnungen aus `qonto_client_invoices`
  über `qonto_client_links` gemappt

### 4.3 Close CRM (`/close/leads`, `/close/deals`)
- Sync über `sync-close-orchestrator` (`sync-close` ist nur ein Shim), plus
  `sync-close-batch`, `sync-close-opportunities`, `sync-close-activities`,
  `sync-close-lead-full`, `sync-close-match-leads`
- Matching-Vorschläge: `pending_close_matches`, `search-close-suggestions(-batch)`
- Admin-Kontrolle: `/admin/close-sync`, Reset via `reset-close-data(-single)`

### 4.4 Meta Ads (Paid Ads)
| Route | Inhalt |
| --- | --- |
| `/meta/uebersicht` | Konten-Überblick |
| `/meta/kampagnen`, `/meta/anzeigengruppen`, `/meta/anzeigen` | Hierarchie + Insights |
| `/meta/leads` | Lead-Export (CSV, dedupliziert) via `export-meta-leads` |
| `/meta/reportings` | Admin: pro Konto Wochenreport, Slack, Kundenmail |
| `/finanzen/abrechnungen` | „Meta Belege": Übersicht, Rechnungen, Zahlungen |
| `/meta/verknuepfungen` | Zuordnung Werbekonto ↔ Kunde |

Kernpunkte:
- Live-Daten über `meta-proxy` / `sync-meta` (Graph API v19), Cache in
  `meta_insights`, `meta_accounts_cache`, `meta_campaign_snapshot`
- Idempotenz über Unique-Constraints in den Edge Functions
- **Verknüpfungen**: `kunde_meta_accounts` ist die Wahrheit. Beim manuellen
  Überschreiben wird zuerst gelöscht, dann neu eingefügt, und alte Referenzen
  werden in `close_deals.meta_ad_account_id` und `clients.meta_account_id(s)`
  bereinigt (`ManualMetaLinkModal.tsx`).
- **Reportings** (`meta_reporting_settings`): Sync liest Konten live via
  `list-meta-accounts`; Zuordnungspriorität: 1) manuelle Verknüpfung,
  2) ID-Mapping, 3) Namens-Fuzzy-Match. `reporting_email_overridden` bleibt erhalten.
  Manueller Trigger (`trigger-meta-manual-reporting`) sendet **immer nur die eine Zeile**
  an n8n; Statusrückmeldung über `update-meta-reporting-status` (Header `X-N8N-Secret`).
- **Abrechnungen**: Saldo/Limits und Rechnungen getrennt behandelt, eigener Token
  `META_BILLING_ACCESS_TOKEN` (nie `META_ACCESS_TOKEN` verändern). Tabs via `?tab=`.
  Tabellen: `meta_billing_account_snapshots`, `meta_billing_invoices` (Backfill 60 Monate),
  `meta_payment_receipts` (Import aus n8n/Gmail, clientseitiger PDF-Download).
- **Budget-Monitor** (`ad_budgets`): Spend vs. Budget, Slack-Alarm bei ≤ 200 €.
- Bekannte Fehlerquelle: Graph-API-Rate-Limit (Code 80004) bei zu vielen Calls pro Konto.

### 4.5 Slack (`/slack`)
- `slack_lists`, `slack_list_items`, `slack_list_aliases`, `slack_item_meta_account`
- Status-Sync-Regel: Eine Slack-Row gilt **nur dann als inaktiv, wenn ALLE**
  verknüpften Meta-Kampagnen inaktiv/pausiert sind (`check-meta-single-item`,
  `check-meta-campaign-events`).
- Benachrichtigungen: 6 Typen mit eigenem Channel-Routing, dynamischer
  Webhook-Manager mit Fallback `VITE_SLACK_TECH_SUPPORT_WEBHOOK`.

### 4.6 Finanzen
- `/finanzen` — Qonto-Buchhaltung, Werbebudgets, Kunden-Budget-Karten
- Qonto-Sync (`sync-qonto`, `qonto-info`): `qonto_transactions(_new)`,
  `qonto_bank_accounts`, `qonto_client_invoices`, `qonto_client_links`, `qonto_sync_*`
- **Qonto-Auth-Header nutzt den rohen String `login:secret` — kein Base64.**
- Live-KPIs: Qonto-Cash + Meta-Ad-Spend

### 4.7 Sales & Referenz-Showcase
- `/sales/uebersicht`, `/sales/referenz-showcase/...` (Websites, Werbeanzeigen /
  Ad-Creatives, Ad-Performance)
- Öffentliche Variante unter `/showcase/...` (`PublicShowcaseLayout`)
- Tabellen: `referenz_showcase`, `referenz_meta_ads`, `referenz_meta_campaigns`,
  `showcase_filter_categories`, `showcase_filter_options`, `showcase_import_jobs`
- Import-Wizard (`BulkImportWizard.tsx`): Suchleiste über Werbekonten, Bereich
  „Fehlende Creatives"; Auto-Zuordnung über `useKundenMapping` (Fuzzy ab 5 Zeichen)
- Filter „Branche + Unternehmen" werden per Edge Function aus `close_deals` synchronisiert
- Verwaltungsrechte über `sales.referenzen.manage` (nicht admin-only)

### 4.8 Creatives / Ad Creative Studio
- Kanban-Review für Ad-Creatives, öffentliches Freigabeportal
- `creative_projects`, `creative_assets`, `creative_feedback`, `creative_approvals`,
  `creative_library` (Sync via `sync-creative-library`)
- Figma-Extraktion → Gemini-Kategorisierung (`figma-creatives`)

### 4.9 Drive & Dateien
- `/drive`, `/drive/meine-dateien`, `/drive/geteilt`, `/drive/papierkorb`
- Alles läuft über `drive-proxy`; Verbindungsstatus konsolidiert aus
  `drive_connection` / `google_drive_connections`
- Kontextueller Datei-Browser (`DriveBrowser.tsx`), Freigaben in `drive_permissions`

### 4.10 E-Mail
- `/email`, `/email/automation-rules`
- IMAP/SMTP über `imap-*` und `shared-imap-*` Edge Functions
- `email_accounts`, `shared_email_accounts`, `*_messages_cache`,
  `email_automation_rules`, `email_automation_executions`
- Klassifizierung clientseitig in `src/lib/email-classifier.ts`

### 4.11 Team & HR
- `/team`, `/mitarbeiter`, `/mitarbeiter/:id` (Tabs: Rollen & Rechte, Drive-Freigaben,
  Zugriffsstatus, MFA-Exempt)
- Mitarbeiter anlegen (`create-team-member`) und löschen (`delete-team-member`, Admin-only,
  mit Sicherheitsdialog)
- Zeiterfassung `/hr/time-tracking`, Check-in-Übersicht `/hr/checkin-overview`
- Tabellen: `team`, `team_hr_data`, `time_entries`, `admin_time_entries`,
  `daily_checkins`, `time_off_requests`, `employment_contracts`, `salary_payments`

### 4.12 ARIA (KI-Assistent)
- Öffnen mit `Cmd+J`; Seite `/aria` mit Zapier-artigem Automation-Builder
- **Execution Policy: Executive-First** — ARIA führt UI-Aktionen direkt über die
  Action Bridge aus, ohne vorher um Erlaubnis zu fragen
- Kontextinjektion über `PAGE_CONTEXTS` (`ariaPageContexts.ts`)
- Wissensbank mit 9 Quelltypen und Context-Scoring (`aria_knowledge`)
- Memory/Feedback: `aria_memory`, `aria_interactions`, LEARN-Blöcke, Daumen-Feedback
- Automationen: `aria_automations`, `aria_automation_logs`
- Voice: Web Speech API über `useARIAVoice` (manuelles Mikrofon-Cleanup nötig)
- Design: „Jarvis"-Stil, 40px Blur, Teal-Glow `hsla(174, 90%, 45%)`
- Das globale Floating-ARIA-Widget wurde entfernt

### 4.13 Fehler- & Support-System
- Globaler JS-Interceptor, max. 3 Fehlerkarten (`ErrorCardOverlay`), KI-Prompt-Generierung
- `/error` (`ErrorPage`) mit Slack-Webhook und KI-Diagnose (`diagnose-error`)
- Bug-Reporting aus der Sidebar: Screenshot → Storage → Slack (`report-bug`, `bug_reports`)
- Support-Tickets: `support_tickets`, `notify-tech-support`

### 4.14 Integrationen (`/integrationen`)
- Karten pro Provider mit Health-Score, ARIA-Setup-Guides, State-Machine
  `NOT_CONNECTED → … → CONFIGURED` (`integration_settings`)
- Meta-Matching: dualer Modus (lokale Fuzzy-Logik + Gemini-KI)
- API-Plattform: REST-Interface, SHA-256-Tokens, 100 Requests/Minute
  (`api_tokens`, `api_logs`, Docs unter `/api-docs`)

---

## 5. MCP-Endpunkte (für Claude relevant)

| Endpunkt | URL-Pfad | Auth | Inhalt |
| --- | --- | --- | --- |
| Meta Ads read-only | `/functions/v1/meta-mcp` | `?key=` oder `x-mcp-key` (`MCP_ACCESS_KEY`) | Accounts, Kampagnen, AdSets, Ads, Insights |
| Claude Meta Connector | `/functions/v1/claude-meta-mcp` | OAuth 2.1 Bearer (Supabase) **oder** `x-api-key: CLAUDE_CONNECTOR_SECRET` | `get_meta_accounts`, `get_meta_kpi_report`, `search_meta_payments`, `diagnose_meta_billing` |
| CRM MCP | `/functions/v1/claude-crm-mcp` | `Authorization: Bearer <CRM_MCP_SECRET>` | `crm_schema`, `crm_query` |

Basis-URL: `https://<project-ref>.supabase.co/functions/v1`

**`claude-crm-mcp` Regeln:**
- Verbindet ausschließlich über `CRM_RO_DATABASE_URL` (read-only Rolle = Sicherheitsgrenze,
  kein Service-Role-Key, kein Supabase-Client)
- `crm_query` erlaubt nur eine einzelne `SELECT`/`WITH`-Anweisung, kein Semikolon im Rumpf,
  blockiert alle schreibenden/DDL-Keywords, max. 200 Zeilen, max. 400.000 Zeichen Ausgabe
- **Immer zuerst `crm_schema` aufrufen** — Tabellennamen nicht raten

Zusätzliche n8n-Schnittstellen: `get-meta-reporting-settings`
(`N8N_META_REPORTING_SECRET`), `get-meta-notification-contacts`,
`trigger-meta-manual-reporting`, `update-meta-reporting-status`, `webhook-receiver`.

Hinweis aus der Praxis: Secrets nur aus Buchstaben/Zahlen erzeugen —
Sonderzeichen/Nicht-ASCII haben wiederholt zu 401-Fehlern geführt.

---

## 6. Datenmodell — Orientierung

Rund 120 Tabellen im Schema `public`. Wichtigste Cluster:

- **Kunden/CRM:** `clients`, `close_deals`, `close_leads`, `close_opportunities`,
  `close_activities`, `close_contacts`, `kunde_close_deals`, `pending_close_matches`
- **Meta:** `meta_accounts_cache`, `meta_insights`, `meta_campaign_snapshot`,
  `meta_campaign_status_log`, `meta_check_runs`, `meta_reporting_settings`,
  `meta_billing_*`, `meta_payment_receipts`, `kunde_meta_accounts`,
  `pending_meta_matches`, `rejected_meta_matches`, `ad_budgets`
- **Finanzen:** `qonto_*`, `invoices`, `finance`, `recurring_revenues`, `salary_payments`
- **Showcase:** `referenz_*`, `showcase_filter_*`, `showcase_import_jobs`,
  `website_highlights`, `company_logos`
- **Team/HR:** `team`, `team_hr_data`, `time_entries`, `daily_checkins`,
  `employee_requests`, `employment_contracts`, `probewoche_candidates`
- **Auth/Rechte:** `user_roles`, `app_permissions`, `role_permissions`,
  `user_permissions`, `user_access_status`, `user_mfa_status`, `mfa_*`
- **ARIA:** `aria_knowledge`, `aria_memory`, `aria_interactions`, `aria_automations`
- **Sonstiges:** `notifications`, `notification_settings`, `slack_*`, `drive_*`,
  `email_*`, `onepage_*`, `pipedrive_*`, `api_tokens`, `api_logs`, `wiki_pages`

**Sicherheitsregel für neue Tabellen:** `CREATE TABLE` → `GRANT` (authenticated /
service_role, `anon` nur bei bewusst öffentlichen Daten) → `ENABLE ROW LEVEL SECURITY`
→ `CREATE POLICY`. Ohne GRANT ist die Tabelle über die Data-API nicht erreichbar.

---

## 7. Wiederkehrende Fallstricke

1. **Realtime:** stabile Channel-Namen (keine Timestamps), vor `subscribe` immer
   `supabase.removeChannel` aufrufen.
2. **Meta Rate-Limits:** Graph-API-Code 80004 tritt bei zu vielen Calls pro Ad-Account auf —
   Batching/Caching statt Live-Refresh in Schleifen.
3. **Verknüpfungen doppelt gepflegt:** Meta-Konto-IDs stehen historisch in
   `kunde_meta_accounts`, `clients.meta_account_id(s)` und `close_deals.meta_ad_account_id`.
   Beim Umverknüpfen alle drei bereinigen.
4. **Kein Service-Role-Key / kein DB-Passwort** verfügbar oder ausgeben.
5. **Manuelle Trigger nie global machen** — immer nur der jeweilige Datensatz/Account.
6. **Nur echte API-Daten anzeigen**, keine Platzhalter- oder Demo-Werte in Reports.

---

## 8. Arbeitsweise-Erwartung an Claude

- Antworten und UI-Texte auf **Deutsch**.
- Vor Datenbank-Fragen: `crm_schema` aufrufen, dann gezielte `crm_query`-SELECTs
  mit `count(*)` statt Massenabfragen.
- Bei Änderungen: den bestehenden Flow respektieren, Scope eng halten,
  Design-Tokens statt Hardcoded-Farben verwenden.
- Sensible Werte (Tokens, Secrets, Bankdaten) niemals ausgeben oder loggen.
