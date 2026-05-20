## Voller Close.com-Sync pro Kunde

Implementiert manueller Full-Sync für Close-Daten (Lead, Custom Fields, Contacts, Opps, Activities, Tasks) mit Resource-Guards.

### 1. SQL Migration (eine Migration, additiv)

- `close_link` existiert bereits → SKIP CREATE, ensure UNIQUE(client_id), UNIQUE(close_lead_id) bestehen
- NEU: `close_leads` (PK close_lead_id, custom_fields jsonb)
- NEU: `close_contacts` (PK close_contact_id, emails/phones jsonb)
- ALTER `close_opportunities` (existiert): Spalten ergänzen falls fehlen (`value_formatted`, `value_currency`, `value_period`, `confidence`, `note`, `date_won`, `date_lost`, `date_updated`, `custom_fields`) — NICHT droppen
- ALTER `close_activities` (existiert): kompatibel halten, keine Drops
- NEU: `close_tasks`
- Alle neuen Tabellen: RLS enable + Policy "authenticated read" (insert/update nur service_role)
- Indexe wie spezifiziert

### 2. Edge Functions (3 neue)

**`sync-close-link`** — Email-basiertes Matching, max 50 Clients/Lauf, sleep 500ms zw. Batches. Returns `{processed, matched, unmatched, ambiguous}`.

**`sync-close-lead-full`** — Pro Client: GET `/lead/{id}` (mit `_fields=*` für Custom Fields + inline contacts/opportunities), GET `/activity/?lead_id=…&date_created__gte=180d&_limit=200`, GET `/task/?lead_id=…&_limit=100`. Per-section try/catch, 429 backoff 2/4/8s, 404 → close_link löschen. Truncate body_preview auf 1000 chars. Delete-then-reinsert für contacts/activities/tasks. Update `close_link.last_synced_at`.

**`sync-close-batch`** — Max 30 client_ids, sequentiell `sync-close-lead-full` aufrufen mit sleep 800ms. Returns `{success, failed}`.

Alle 3 Functions: CORS, kein raw_data, console.log mit Mem-Counter alle 10 Items.

### 3. Frontend `src/pages/KundenDetail.tsx`

- **Sync-Pill** im Header: Grün <24h / Gelb 1-3d / Rot >3d / Grau pulsing während Sync. Dropdown: "Jetzt syncen", "In Close öffnen", "Verknüpfung lösen". (Pill teilweise schon vorhanden aus früherem Sync — erweitern statt neu.)
- **Card "Close.com Daten"** im Übersicht-Tab unter Stammdaten: Lead-Infos / Custom Fields (loop jsonb) / Kontaktpersonen (mailto/tel).
- **Neuer Tab "Aktivitäten"**: Liste sortiert DESC, Filter-Pills (Alle/Email/Call/Note/Meeting/SMS), expandable body, Empty-State.
- **Neuer Tab "Tasks"** (conditional, nur wenn Tasks vorhanden): Offene oben sortiert by due_date ASC.
- **Deals-Tab erweitern**: Section "Aus Close.com" mit KPI-Karten (Won-Count+Sum, Active-Count, Letzter Won) + Liste sortiert (won → active → lost).

### 4. Admin-Sub-Page `/einstellungen/close-sync`

Erweitert `src/pages/admin/CloseSync.tsx` (existiert) bzw. mountet zusätzlich unter Einstellungen-Route:

- Stat-Cards: verlinkte Kunden X/Y, letzter globaler Sync, total Activities
- Button "Alle nicht-verlinkten matchen" → `sync-close-link` ohne body
- Tabelle verlinkter Kunden mit Multi-Select-Checkbox (max 30) → "Ausgewählte syncen" → `sync-close-batch`
- Bestehende Unmatched-Liste + Manual-Link-Modal bleibt

### 5. Smoke-Test nach Deploy

- `sync-close-link` mit Stefan-ID → 1 Link
- `sync-close-lead-full` mit Stefan-ID → Daten in 5 Tabellen
- UI-Check auf `/kunden/{stefan}`
- SQL-Count-Check

### Out of Scope

- Kein Cron, kein Write-Back, keine Webhooks
- `sync-notion`, `close_deals`, RLS-Defaults bleiben unverändert
- Bestehende `sync-close-*`-Functions (orchestrator/match-leads/opportunities/activities) bleiben unangetastet — Parallelbetrieb

### Technische Notizen

- Close API: Basic Auth `btoa(API_KEY + ':')`
- `/lead/{id}` liefert standardmäßig Custom Fields als `custom.cf_*` Keys → in jsonb mappen
- Activities-Endpoint: `_type` Filter optional, holen ALLE Types, im Frontend filtern
- Memory: `Deno.memoryUsage?.().heapUsed` (optional chain, fallback 0)
