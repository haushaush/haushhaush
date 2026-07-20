// Shared logic for the Claude Meta Connector (read-only).
// Consumed by: claude-meta-accounts, claude-meta-kpi-report,
// claude-meta-payments-search, claude-meta-billing-diagnose, claude-meta-mcp.
//
// Hard rules:
// - Never emit Meta tokens (or fragments) in logs, responses or errors.
// - No silent fallback on missing secrets — surface `secret_missing`.
// - Read-only: no writes to Meta, no writes to app tables.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const API_VERSION = "v19.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export type ConnectorResult<T = unknown> = {
  success: boolean;
  data: T | null;
  error: string | null;
  diagnostics: Record<string, unknown>;
};

export function ok<T>(data: T, diagnostics: Record<string, unknown> = {}): ConnectorResult<T> {
  return { success: true, data, error: null, diagnostics };
}
export function fail(
  error: string,
  diagnostics: Record<string, unknown> = {},
): ConnectorResult<null> {
  return { success: false, data: null, error, diagnostics };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Check x-api-key header against CLAUDE_CONNECTOR_SECRET. */
export function checkAuth(req: Request): Response | null {
  const configured = Deno.env.get("CLAUDE_CONNECTOR_SECRET");
  const provided = req.headers.get("x-api-key");
  if (!configured || !provided || provided !== configured) {
    return jsonResponse({ success: false, error: "unauthorized" }, 401);
  }
  return null;
}

export function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function normalizeAct(id: string): string {
  const s = String(id).trim();
  return s.startsWith("act_") ? s : `act_${s.replace(/^act_/, "")}`;
}

/** Classify a Meta Graph API error into one of the documented error codes. */
function classifyMetaError(err: any): string {
  const code = err?.code;
  const sub = err?.error_subcode;
  const msg = String(err?.message ?? "").toLowerCase();
  if (code === 10 || code === 200 || code === 294 || code === 3 || sub === 1349125) return "permission_denied";
  if (code === 100 && msg.includes("nonexisting field")) return "invalid_fields";
  if (code === 100 && msg.includes("business")) return "business_access_missing";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "rate_limited";
  return "meta_error";
}

/** Wrap a graph fetch that must not leak the access token. */
async function graphGet(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<any> {
  const url = new URL(`${GRAPH}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data?.error) {
    const cls = classifyMetaError(data?.error);
    const e: any = new Error(data?.error?.message ?? `Graph API error (${res.status})`);
    e.status = res.status;
    e.classified = cls;
    // Never propagate the token in error text.
    throw e;
  }
  return data;
}

async function graphGetAll(
  path: string,
  params: Record<string, string>,
  token: string,
  max = 2000,
): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = null;
  let first = true;
  while (first || next) {
    let data: any;
    if (first) {
      data = await graphGet(path, { ...params, limit: params.limit ?? "100" }, token);
      first = false;
    } else {
      const res = await fetch(next as string);
      data = await res.json();
      if (!res.ok || data?.error) {
        const cls = classifyMetaError(data?.error);
        const e: any = new Error(data?.error?.message ?? `Graph paging error`);
        e.classified = cls;
        throw e;
      }
    }
    if (Array.isArray(data.data)) rows.push(...data.data);
    next = data?.paging?.next ?? null;
    if (rows.length >= max) break;
  }
  return rows.slice(0, max);
}

// ---------- 1) accounts ----------

export async function fetchAccounts(): Promise<ConnectorResult> {
  const token = Deno.env.get("META_ACCESS_TOKEN");
  if (!token) return fail("secret_missing", { missing: "META_ACCESS_TOKEN" });
  const supabase = getSupabase();

  let rows: any[];
  try {
    rows = await graphGetAll(
      "/me/adaccounts",
      { fields: "id,account_id,name,account_status,currency", limit: "100" },
      token,
    );
  } catch (e: any) {
    return fail(e.classified ?? "meta_error", { message: e.message });
  }

  // Read-only enrichment from local slack assignment + cache.
  const ids = rows.map((r: any) => r.id).filter(Boolean);
  const [assign, cache] = await Promise.all([
    supabase.from("slack_item_meta_account")
      .select("meta_account_id,slack_item_id,slack_list_id,meta_account_name,matched_client_id,assigned_at")
      .in("meta_account_id", ids),
    supabase.from("meta_accounts_cache")
      .select("meta_account_id,last_synced_at,business_name")
      .in("meta_account_id", ids),
  ]);

  const assignMap = new Map<string, any>();
  for (const a of assign.data ?? []) assignMap.set(a.meta_account_id, a);
  const cacheMap = new Map<string, any>();
  for (const c of cache.data ?? []) cacheMap.set(c.meta_account_id, c);

  const accounts = rows.map((r: any) => {
    const a = assignMap.get(r.id);
    const c = cacheMap.get(r.id);
    return {
      id: r.id,
      account_id: r.account_id ?? String(r.id).replace(/^act_/, ""),
      name: r.name ?? null,
      status: r.account_status === 1 ? "active" : "inactive",
      currency: r.currency ?? null,
      business_name: c?.business_name ?? null,
      last_synced_at: c?.last_synced_at ?? null,
      slack: a
        ? {
            item_id: a.slack_item_id,
            list_id: a.slack_list_id,
            display_name: a.meta_account_name,
            matched_client_id: a.matched_client_id,
            assigned_at: a.assigned_at,
          }
        : null,
    };
  });

  return ok({ count: accounts.length, accounts }, { source: "graph_api" });
}

// ---------- 2) KPI report ----------

const RESULT_ACTION_PRIORITY = [
  "lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_web_lead",
  "complete_registration",
  "onsite_conversion.messaging_conversation_started_7d",
];

function pickResult(actions: any[] | undefined, cpa: any[] | undefined) {
  const list = Array.isArray(actions) ? actions : [];
  const cprList = Array.isArray(cpa) ? cpa : [];
  for (const t of RESULT_ACTION_PRIORITY) {
    const a = list.find((x) => x.action_type === t);
    if (a) {
      const cprEntry = cprList.find((x) => x.action_type === t);
      return {
        type: t,
        value: Number(a.value ?? 0),
        cost_per: cprEntry ? Number(cprEntry.value) : null,
      };
    }
  }
  return { type: null, value: 0, cost_per: null };
}

function buildKundentext(bestCreatives: any[], totals: any) {
  if (!bestCreatives.length) {
    return `Aktueller Zeitraum: ${totals.spend.toFixed(2)} € Ausgaben, ${totals.results} Ergebnisse. Keine ausreichenden Creative-Daten für ein Detail-Update.`;
  }
  const parts = bestCreatives.slice(0, 3).map((c, i) => {
    const cpl = c.cost_per_result != null ? `${c.cost_per_result.toFixed(2)} € CPL` : "kein CPL-Wert";
    return `${i + 1}. „${c.ad_name}" (${c.campaign_name ?? "Kampagne unbekannt"}): ${c.results} Ergebnisse bei ${c.spend.toFixed(2)} € Spend, ${cpl}`;
  });
  return `Beste Creatives im Zeitraum: ${parts.join(" · ")}. Gesamt: ${totals.results} Ergebnisse, ${totals.spend.toFixed(2)} € Spend, Ø CPL ${totals.results ? (totals.spend / totals.results).toFixed(2) : "–"} €.`;
}

async function reportForAccount(actId: string, since: string, until: string, token: string) {
  const timeRange = JSON.stringify({ since, until });
  // Account-level aggregate.
  const acc = await graphGet(
    `/${actId}/insights`,
    {
      level: "account",
      time_range: timeRange,
      fields: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,cost_per_action_type",
    },
    token,
  );
  const row = acc?.data?.[0] ?? {};
  const result = pickResult(row.actions, row.cost_per_action_type);
  const account_kpi = {
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    reach: Number(row.reach ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: row.ctr != null ? Number(row.ctr) : null,
    cpc: row.cpc != null ? Number(row.cpc) : null,
    cpm: row.cpm != null ? Number(row.cpm) : null,
    results: result.value,
    cpl: result.cost_per,
    result_action_type_used: result.type,
  };

  // Ad-level for top creatives.
  const adRows = await graphGetAll(
    `/${actId}/insights`,
    {
      level: "ad",
      time_range: timeRange,
      fields: "ad_id,ad_name,campaign_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type",
      limit: "200",
    },
    token,
  );
  const ads = adRows.map((r: any) => {
    const res = pickResult(r.actions, r.cost_per_action_type);
    return {
      ad_id: r.ad_id,
      ad_name: r.ad_name,
      campaign_name: r.campaign_name,
      spend: Number(r.spend ?? 0),
      impressions: Number(r.impressions ?? 0),
      clicks: Number(r.clicks ?? 0),
      ctr: r.ctr != null ? Number(r.ctr) : null,
      cpc: r.cpc != null ? Number(r.cpc) : null,
      results: res.value,
      cost_per_result: res.cost_per,
      result_action_type_used: res.type,
    };
  });
  ads.sort((a, b) => {
    if (b.results !== a.results) return b.results - a.results;
    const ca = a.cost_per_result ?? Number.POSITIVE_INFINITY;
    const cb = b.cost_per_result ?? Number.POSITIVE_INFINITY;
    if (ca !== cb) return ca - cb;
    return b.spend - a.spend;
  });
  const top = ads.slice(0, 3);

  return {
    account_id: actId,
    account_kpi,
    top_creatives: top,
    kundentext: buildKundentext(top, {
      spend: account_kpi.spend,
      results: account_kpi.results,
    }),
    diagnostics: {
      result_action_type_used: account_kpi.result_action_type_used,
      ads_considered: ads.length,
    },
  };
}

export async function fetchKpiReport(input: {
  since: string;
  until: string;
  account_id?: string;
}): Promise<ConnectorResult> {
  const token = Deno.env.get("META_ACCESS_TOKEN");
  if (!token) return fail("secret_missing", { missing: "META_ACCESS_TOKEN" });
  const { since, until, account_id } = input ?? ({} as any);
  if (!since || !until) return fail("invalid_fields", { missing: ["since", "until"] });

  try {
    let actIds: string[] = [];
    if (account_id) {
      actIds = [normalizeAct(account_id)];
    } else {
      const accounts = await graphGetAll(
        "/me/adaccounts",
        { fields: "id,account_status", limit: "100" },
        token,
      );
      actIds = accounts.filter((a: any) => a.account_status === 1).map((a: any) => a.id);
    }

    const reports = [];
    const errors: Record<string, string> = {};
    for (const id of actIds) {
      try {
        reports.push(await reportForAccount(id, since, until, token));
      } catch (e: any) {
        errors[id] = e.classified ?? "meta_error";
      }
    }

    return ok(
      { since, until, accounts: reports.length, reports },
      { failed_accounts: errors, requested: actIds.length },
    );
  } catch (e: any) {
    return fail(e.classified ?? "meta_error", { message: e.message });
  }
}

// ---------- 3) payments search ----------

export async function searchPayments(input: {
  transaction_id?: string;
  date_from?: string;
  date_to?: string;
  amount?: number;
  meta_account_id?: string;
  account_name?: string;
  allow_gmail_search?: boolean;
}): Promise<ConnectorResult> {
  const supabase = getSupabase();
  let q = supabase.from("meta_payment_receipts").select("*");

  if (input.transaction_id) q = q.eq("transaction_id", input.transaction_id);
  if (input.meta_account_id) {
    const id = input.meta_account_id.replace(/^act_/, "");
    q = q.or(`meta_account_id.eq.${input.meta_account_id},meta_account_id_numeric.eq.${id}`);
  }
  if (input.account_name) q = q.ilike("account_name", `%${input.account_name}%`);
  if (input.date_from) q = q.gte("transaction_date", input.date_from);
  if (input.date_to) q = q.lte("transaction_date", input.date_to);
  if (typeof input.amount === "number") q = q.eq("amount", input.amount);

  const { data: local, error } = await q.order("transaction_date", { ascending: false }).limit(200);
  if (error) return fail("db_error", { message: error.message });

  const diagnostics: Record<string, unknown> = { local_count: local?.length ?? 0, gmail_used: false };

  if ((local?.length ?? 0) > 0 || !input.allow_gmail_search) {
    return ok({ local: local ?? [], gmail_suggestions: [] }, diagnostics);
  }

  // Gmail fallback via n8n webhook — reuse existing secret names, honor
  // caller-preferred names first.
  const webhookUrl =
    Deno.env.get("N8N_META_PAYMENT_SEARCH_WEBHOOK_URL") ??
    Deno.env.get("N8N_GMAIL_SEARCH_WEBHOOK_URL");
  const webhookSecret =
    Deno.env.get("N8N_META_PAYMENT_SEARCH_SECRET") ??
    Deno.env.get("N8N_GMAIL_SEARCH_WEBHOOK_SECRET");
  if (!webhookUrl || !webhookSecret) {
    return fail("secret_missing", {
      ...diagnostics,
      missing: ["N8N_GMAIL_SEARCH_WEBHOOK_URL", "N8N_GMAIL_SEARCH_WEBHOOK_SECRET"],
    });
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify({
        transaction_id: input.transaction_id ?? null,
        date_from: input.date_from ?? null,
        date_to: input.date_to ?? null,
        amount: input.amount ?? null,
        meta_account_id: input.meta_account_id ?? null,
        account_name: input.account_name ?? null,
      }),
    });
    if (!res.ok) {
      return fail("gmail_search_failed", { ...diagnostics, status: res.status });
    }
    const raw = await res.json();
    const suggestions = Array.isArray(raw?.results) ? raw.results : Array.isArray(raw) ? raw : [];
    diagnostics.gmail_used = true;
    diagnostics.gmail_count = suggestions.length;
    return ok({ local: [], gmail_suggestions: suggestions }, diagnostics);
  } catch (e: any) {
    return fail("gmail_search_failed", { ...diagnostics, message: e?.message });
  }
}

// ---------- 4) billing diagnose ----------

export async function billingDiagnose(): Promise<ConnectorResult> {
  const supabase = getSupabase();
  const hat_billing_token = !!Deno.env.get("META_BILLING_ACCESS_TOKEN");
  const businessId = Deno.env.get("META_BUSINESS_ID");
  const token = Deno.env.get("META_BILLING_ACCESS_TOKEN");

  let business_invoices_erreichbar: boolean | null = null;
  let reachError: string | null = null;
  if (hat_billing_token && businessId) {
    try {
      await graphGet(
        `/${businessId}/business_invoices`,
        { fields: "id", limit: "1" },
        token!,
      );
      business_invoices_erreichbar = true;
    } catch (e: any) {
      business_invoices_erreichbar = false;
      reachError = e.classified ?? "meta_error";
    }
  } else {
    business_invoices_erreichbar = false;
    reachError = "secret_missing";
  }

  const [{ data: last }, { count }] = await Promise.all([
    supabase
      .from("meta_payment_receipts")
      .select("created_at,updated_at,transaction_date")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("meta_payment_receipts")
      .select("id", { count: "exact", head: true }),
  ]);

  return ok(
    {
      hat_billing_token,
      business_invoices_erreichbar,
      letzter_erfolgreicher_payment_import: last?.created_at ?? null,
      anzahl_payments_lokal: count ?? 0,
    },
    { reach_error: reachError },
  );
}
