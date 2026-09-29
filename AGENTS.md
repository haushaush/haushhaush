# Architecture Rules

- Meta access token: all Meta edge functions resolve the token via `supabase/functions/_shared/meta-config.ts` (`getMetaConfig`/`getMetaToken`/`getMetaBusinessId`), which reads the connected `integration_settings` row (provider `meta_ads`) first and falls back to `META_ACCESS_TOKEN`/`META_BUSINESS_ID` env secrets. Why: single source of truth in the Integrations UI. Exception: `sync-meta-billing`/`debug-meta-billing` intentionally use the separate `META_BILLING_ACCESS_TOKEN`.
