# Claude Meta Connector (read-only)

Fünf Edge Functions, die Meta-Werbedaten schreibgeschützt für Claude bereitstellen.
Auth für **alle** Endpunkte: HTTP-Header `x-api-key: <CLAUDE_CONNECTOR_SECRET>`.
Fehlt/falsch → `401 { "success": false, "error": "unauthorized" }` (keine Details).

Base-URL:
`https://fqcueblsinjiclolubwv.supabase.co/functions/v1`

## Endpoints

| Function | Methode | Zweck |
| --- | --- | --- |
| `/claude-meta-accounts` | GET/POST | Alle Ad Accounts + Slack-/Kundenzuordnung |
| `/claude-meta-kpi-report` | POST | Aggregierter KPI-Report + Top-3 Creatives + `kundentext` |
| `/claude-meta-payments-search` | POST | Lokale Payment-Suche, optionaler Gmail-Fallback |
| `/claude-meta-billing-diagnose` | GET/POST | Booleans/Status zur Billing-Anbindung |
| `/claude-meta-mcp` | GET/POST | MCP-Server (JSON-RPC 2.0, Streamable HTTP) |

## Response-Format

```json
{ "success": true, "data": {...}, "error": null, "diagnostics": {...} }
```

## Fehlercodes (`error`-Feld)

- `unauthorized` — Auth fehlgeschlagen (401)
- `secret_missing` — benötigtes Server-Secret nicht gesetzt
- `permission_denied` — Meta lehnt Zugriff ab
- `invalid_fields` — ungültige/fehlende Eingabefelder
- `business_access_missing` — keine Berechtigung für Business/Endpoint
- `rate_limited` — Meta Rate-Limit erreicht
- `gmail_search_failed` — n8n-Webhook nicht erreichbar
- `db_error` / `internal_error` / `meta_error` — generisch

## Beispiele

```bash
# 401-Test (ohne Key)
curl -i https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-mcp

# 200-Test (mit Key)
curl -i \
  -H "x-api-key: DEIN_SECRET" \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-mcp

# Accounts
curl -H "x-api-key: DEIN_SECRET" \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-accounts

# KPI Report
curl -X POST -H "x-api-key: DEIN_SECRET" -H "Content-Type: application/json" \
  -d '{"since":"2026-07-01","until":"2026-07-20"}' \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-kpi-report

# Payment Search (lokal)
curl -X POST -H "x-api-key: DEIN_SECRET" -H "Content-Type: application/json" \
  -d '{"amount":123.45,"date_from":"2026-06-01","date_to":"2026-07-20"}' \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-payments-search

# Payment Search inkl. Gmail-Fallback
curl -X POST -H "x-api-key: DEIN_SECRET" -H "Content-Type: application/json" \
  -d '{"transaction_id":"TX-123","allow_gmail_search":true}' \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-payments-search

# Billing Diagnose
curl -H "x-api-key: DEIN_SECRET" \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-billing-diagnose

# MCP tools/list
curl -X POST -H "x-api-key: DEIN_SECRET" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-mcp
```

## MCP-Tools

1. `get_meta_accounts` — keine Parameter
2. `get_meta_kpi_report` — `{ since, until, account_id? }`
3. `search_meta_payments` — `{ transaction_id?, date_from?, date_to?, amount?, meta_account_id?, account_name?, allow_gmail_search? }`
4. `diagnose_meta_billing` — keine Parameter
