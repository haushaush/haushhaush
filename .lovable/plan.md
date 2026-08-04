# Mehrquellen-Architektur: Viral Connect + Haush Haush + Lexoffice

Ziel: Aus dem fest verdrahteten Ein-Konto-Setup wird ein Quellen-Register mit Herkunft an jeder Zeile, ausfalltoleranten Syncs und einer Entdopplung über `clients.id`. Fällt eine Quelle aus, verschwindet sie still aus den Auswertungen — mit sichtbarem Hinweis, ohne Fehler.

## Befund im Bestand (geprüft)

- `CLOSE_API_KEY` wird in 7 Edge Functions direkt aus der Umgebung gelesen: `close-proxy`, `sync-close-match-leads`, `sync-close-opportunities`, `sync-close-activities`, `sync-close-lead-full`, `sync-close-link`, `search-close-suggestions`. Der Orchestrator (`sync-close-orchestrator`) ruft die drei Batch-Functions nacheinander per Service-Role auf.
- Schlüssel heute:
  - `close_leads.id` — **text, Primary Key**, enthält die Close-Lead-ID
  - `close_opportunities.id` — **text, Primary Key**, Close-Opportunity-ID
  - `close_activities` — uuid-PK, `UNIQUE (close_activity_id)`
  - `close_contacts` — **PK = `close_contact_id` (text)**
  - `close_link` — `UNIQUE (close_lead_id)` **und `UNIQUE (client_id)`**
  - `kunde_close_deals` — `UNIQUE (kunde_id, close_opportunity_id)`
  - `pending_close_matches` — `UNIQUE (kunde_id, close_lead_id)`
- Keine Fremdschlüssel zeigen auf `close_leads` oder `close_opportunities`; die Verknüpfung läuft über lose Textspalten (`close_lead_id`). Das erleichtert den Umbau erheblich.

### Antwort auf Frage 1 — was bricht

| Stelle | Risiko | Umgang |
|---|---|---|
| `close_link` `UNIQUE (client_id)` | **Härtester Bruch.** Ein Kunde, der in VC *und* HH liegt, kann nicht zwei Leads haben. | Constraint auf `UNIQUE (source_id, client_id)` + `UNIQUE (source_id, close_lead_id)` umstellen. Damit hat ein Client je Quelle genau einen Lead. |
| `close_leads.id` / `close_opportunities.id` als Text-PK | Externe ID als PK verhindert dieselbe ID in zwei Quellen und macht `source_id` semantisch wirkungslos. | Surrogat-uuid-PK einführen, alte Spalte in `close_lead_id` / `close_opportunity_id` umbenennen, `UNIQUE (source_id, close_lead_id)`. Frontend-Routen, die `close_leads.id` in URLs führen, mitziehen. |
| `close_contacts` PK = `close_contact_id` | wie oben | Surrogat-PK + `UNIQUE (source_id, close_contact_id)`. |
| `kunde_close_deals`, `pending_close_matches` | Referenzieren `close_deals.id` (uuid) — unkritisch; die Opportunity-/Lead-ID-Spalten sind Text und brauchen `source_id`. | `source_id` ergänzen, Unique auf `(source_id, …)` erweitern. |
| Qonto (`qonto_client_links`, `qonto_client_invoices`) | Hängt an `clients.id`, nicht an Close. **Kein Bruch.** | unverändert |
| Meta (`kunde_meta_accounts`, `close_deals.meta_ad_account_id`) | Hängt an `close_deals`/`clients`. **Kein Bruch**, solange `close_deals.id` uuid bleibt. | unverändert |
| Bonus-Cockpit (`bonus_*`) | Referenziert `clients.id` und `close_activity_id` als Text. | `close_activity_id` bleibt Text; Entdopplung greift, weil Bonus über `clients.id` aggregiert. |
| Frontend: `Kunden.tsx`, `KundenDetail.tsx`, `KundeCloseTab.tsx`, `CloseSyncCard`, `CloseMatchingCard`, `CloseActiveMatchesTable`, `admin/CloseSync.tsx` | Erwarten je Client genau eine Close-Verknüpfung. | Auf Listen umstellen: pro Quelle eine Zeile/Badge. |

### Antwort auf Frage 2 — Constraint-Migration ohne Datenverlust

Pro Tabelle in dieser Reihenfolge, alles in einer Transaktion je Tabelle:

1. `ALTER TABLE … ADD COLUMN source_id uuid REFERENCES data_sources(id)` (zunächst nullable)
2. Backfill: `UPDATE … SET source_id = (SELECT id FROM data_sources WHERE key='close_vc')`
3. `ALTER COLUMN source_id SET NOT NULL`
4. Bei Tabellen mit externer ID als PK: neue Spalte `id_new uuid DEFAULT gen_random_uuid()`, alte `id` → `close_lead_id` umbenennen, `id_new` → `id`, PK tauschen. Alte Werte bleiben vollständig erhalten, nur die Rolle der Spalte ändert sich.
5. Neuen Composite-Unique **anlegen**, alten Single-Column-Unique erst **danach** droppen — so gibt es nie ein Fenster ohne Idempotenzschutz.
6. Vorher jeweils prüfen, ob der Composite-Index sich anlegen lässt (`SELECT source_id, close_lead_id, count(*) … HAVING count(*)>1`); bei Treffern Abbruch statt Datenbereinigung im Blindflug.

Kein `DROP COLUMN`, keine Löschungen. Der Backfill ist deterministisch, weil heute per Definition alles aus dem VC-Account stammt.

## 1. Quellen-Register

`data_sources`: `id`, `key` (unique), `label`, `typ` (enum `close|lexoffice|qonto|meta`), `aktiv`, `secret_name`, `config` jsonb, `letzter_sync_am`, `letzter_sync_status` (`ok|fehler|laeuft|nie`), `letzter_fehler`, `sortierung`, Timestamps. GRANT + RLS: Lesen für `authenticated` mit `integrationen.view`, Schreiben nur Admin; `service_role` voll. Seed: `close_vc`, `close_hh`, `lexoffice`, `qonto`, `meta`. In der Tabelle steht nur `secret_name` — der Wert bleibt im Secret-Store.

## 2. Herkunft an jeder Zeile

`source_id` in `close_leads`, `close_opportunities`, `close_activities`, `close_contacts`, `close_deals`, `close_link`, `kunde_close_deals`, `pending_close_matches` sowie in allen neuen `lexoffice_*`-Tabellen. Constraint-Umstellung wie unter Frage 2.

## 3. Sync source-aware

- Neues Shared-Modul `supabase/functions/_shared/sources.ts`: `getActiveSources(typ)`, `getSourceSecret(source)`, `markSourceOk/Fehler(sourceId, msg)`.
- Jede Close-Function bekommt einen `source_id`-Parameter und baut ihren Client daraus, statt `Deno.env.get("CLOSE_API_KEY")` global zu lesen. `close_vc` behält `CLOSE_API_KEY` als `secret_name`, `close_hh` bekommt `CLOSE_API_KEY_HH`.
- `sync-close-orchestrator` iteriert über aktive Close-Quellen. Jede Quelle läuft in eigenem `try/catch`: Fehler → `letzter_sync_status='fehler'` + `letzter_fehler`, `continue`. Ein Ausfall bricht die Schleife nie ab. Ergebnis pro Quelle im Response-Body.
- Fehlendes Secret ist kein Absturz, sondern derselbe Fehlerpfad.

## 4. Entdopplung

Wiederverwendbar statt neu:
- `close_link` wird **die** Zuordnungsebene (Client ↔ Lead je Quelle), nachdem der Unique auf `(source_id, client_id)` steht. Keine neue Mapping-Tabelle nötig.
- `pending_close_matches` bleibt die Vorschlagsliste mit manueller Bestätigung (`status pending|approved|rejected` existiert samt Trigger) — erweitert um `source_id` und zusätzliche Match-Signale.
- `search-close-suggestions` / `-batch` liefern die Kandidatensuche und werden nur um die Quelle erweitert.
- `merge_duplicate_clients()` existiert bereits für Client-Dubletten und bekommt `close_link`-Behandlung für den Mehrquellenfall (heute behält sie nur eine Zeile, weil Unique auf `client_id` liegt).

Neuer Vorschlagsmechanismus als DB-Funktion `suggest_client_matches(source_id)`: Score aus normalisiertem Namen, E-Mail-Domain, Telefon (Ziffern), exakter E-Mail. ≥0.95 automatisch, 0.6–0.95 als `pending_close_matches`, darunter ignoriert.

Aggregationen zählen ausschließlich `count(distinct clients.id)` bzw. summieren über `clients.id`, nie über Lead-IDs.

## 5. Lexoffice

Endpunkte (API v1, `https://api.lexoffice.io/v1`, Bearer-Token aus Secret `LEXOFFICE_API_KEY`):
- `GET /voucherlist?voucherType=invoice,creditnote,downpaymentinvoice&voucherStatus=…` — Liste, seitenweise
- `GET /invoices/{id}` — Rechnungsdetail
- `GET /contacts?page=…` — Kontakte
- `GET /vouchers/{id}` und `GET /files/{id}` — Belege/Dateien
- `GET /dunnings/{id}` bzw. Mahnungen über die Voucherlist

Paginierung: `page`/`size` (max 250), Abbruch bei `last: true`. Rate-Limit: 2 Req/s → fester Abstand von 550 ms plus Backoff bei HTTP 429 (`Retry-After` beachten), max. 3 Versuche, danach Quelle als Fehler markieren und weiterlaufen.

Tabellen (je mit `source_id`, GRANT → RLS → Policy): `lexoffice_contacts`, `lexoffice_invoices`, `lexoffice_vouchers`, `lexoffice_dunnings`, `lexoffice_client_links` (analog `qonto_client_links`: `lexoffice_contact_id`, `client_id`, `match_type`, `confidence`, `is_confirmed`). Idempotenz über `UNIQUE (source_id, lexoffice_id)`.

## 6. Ausfalltolerante Auswertungen

Vorschlag: **Views plus eine Hilfsfunktion**, keine RLS-Lösung (RLS würde auch Admin-Sichten auf inaktive Quellen verhindern und den Sync selbst behindern).

- `public.active_source_ids()` — stable SQL, liefert IDs aktiver Quellen.
- Je Basistabelle eine View `v_close_leads`, `v_close_opportunities`, `v_close_activities`, `v_lexoffice_invoices` … mit `WHERE source_id IN (SELECT active_source_ids())`.
- Frontend und Aggregatfunktionen lesen künftig die Views, nie die Basistabellen. Der Sync schreibt weiter direkt auf die Basistabellen.
- Ein Hook `useDataSources()` (Client) liefert die Quellenliste inkl. Status für den Hinweis-Banner.

Anzupassende Seiten: `Kunden.tsx`, `KundenDetail.tsx`, `KundenPipeline.tsx`, `CloseDeals.tsx`, `CloseLeads.tsx`, `CloseVerknuepfungen.tsx`, `Finanzen.tsx`, `Dashboard.tsx`, `KundeCloseTab.tsx` — jeweils Tabellen- durch View-Zugriff ersetzen und den Banner einhängen.

## 7. Oberfläche

- Neue Seite `/integrationen/quellen` (Permission `integrationen.view`, Schreiben Admin): Karte je Quelle mit Typ, Aktiv-Schalter, letztem Sync, Status-Badge, letztem Fehler im Klartext und Button „Diese Quelle synchronisieren“. Kein globaler Sync-Button.
- Komponente `<InaktiveQuellenHinweis />`: dezenter Hinweisstreifen „Quelle X nicht einbezogen“ über Auswertungen, sobald eine Quelle inaktiv oder im Fehlerstatus ist.

### Antwort auf Frage 3 — Stufenschnitt

1. **Register + Herkunft (nicht wirksam).** `data_sources` anlegen, `source_id` in alle Close-Tabellen, Backfill auf `close_vc`, Composite-Uniques anlegen, alte danach droppen. Nichts liest die Spalte — das System verhält sich unverändert.
2. **Sync source-aware.** `_shared/sources.ts`, Functions auf `source_id` umstellen, Orchestrator-Schleife mit Fehlerisolierung. Weiterhin nur eine aktive Close-Quelle → Verhalten identisch, aber die Struktur trägt.
3. **Views + Frontend-Umstellung + Verwaltungsseite.** Ab hier ist Ein-/Ausschalten wirksam und sichtbar.
4. **`close_hh` scharf schalten.** Secret hinterlegen, Quelle aktivieren, erster Sync. Erst jetzt entstehen echte Dubletten.
5. **Entdopplung.** Vorschlagsfunktion, erweiterte `pending_close_matches`-Oberfläche, Aggregationen auf `distinct clients.id`.
6. **Lexoffice.** Tabellen, Sync-Function, Kontakt-Mapping, Auswertung.

Nach jeder Stufe ist das System lauffähig; Stufe 4 ist bewusst hinter der Umstellung, damit keine Dubletten entstehen, bevor die Entdopplung sichtbar ist — Stufe 5 folgt unmittelbar.

## Nicht in diesem Umbau

Migration von Qonto/Meta auf `source_id` (beide haben schon eine eigene Zuordnungsebene), Zusammenführung von Close- und Lexoffice-Rechnungen in eine gemeinsame Sicht, Cron-Jobs für die neuen Syncs.
