// Claude Meta Connector — MCP Server (Streamable HTTP, JSON-RPC 2.0).
// Auth options (any one succeeds):
//   1) OAuth 2.1 Bearer token from Supabase Auth (Authorization: Bearer <jwt>)
//      -> preferred for Claude / Cowork remote MCP clients.
//   2) x-api-key header vs CLAUDE_CONNECTOR_SECRET (legacy / server-to-server).
//   3) ?key= query param vs CLAUDE_CONNECTOR_SECRET (legacy).
// The key/URL is never logged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  billingDiagnose,
  corsHeaders,
  ConnectorResult,
  fetchAccounts,
  fetchKpiReport,
  jsonResponse,
  searchPayments,
} from "../_shared/claude-connector.ts";

const PROJECT_REF = "fqcueblsinjiclolubwv";
const ISSUER = `https://${PROJECT_REF}.supabase.co/auth/v1`;

function resourceUrl(req: Request): string {
  const u = new URL(req.url);
  // Edge runtime sees `http://` internally; the public URL is always https.
  return `https://${u.host}/functions/v1/claude-meta-mcp`;
}

function protectedResourceMetadata(req: Request) {
  return {
    resource: resourceUrl(req),
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "email", "profile"],
    resource_documentation:
      "https://fqcueblsinjiclolubwv.supabase.co/functions/v1/claude-meta-mcp",
  };
}

function unauthorized(req: Request): Response {
  const metaUrl = `${resourceUrl(req)}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({ success: false, error: "unauthorized" }),
    {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "WWW-Authenticate":
          `Bearer realm="claude-meta-mcp", resource_metadata="${metaUrl}"`,
      },
    },
  );
}

async function verifyBearer(token: string): Promise<boolean> {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data?.user) return false;
    // Restrict OAuth access to admins only.
    const { data: roles } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    return !!roles;
  } catch {
    return false;
  }
}

/** Returns null if authenticated, otherwise a Response to send. */
async function checkAuth(req: Request): Promise<Response | null> {
  const configured = Deno.env.get("CLAUDE_CONNECTOR_SECRET");

  // 1) OAuth Bearer token
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    // Legacy: allow raw shared-secret in Bearer for backwards-compat.
    if (configured && token === configured) return null;
    if (token && await verifyBearer(token)) return null;
    return unauthorized(req);
  }

  // 2/3) Shared secret via header or query
  const fromHeader = req.headers.get("x-api-key");
  const fromQuery = new URL(req.url).searchParams.get("key");
  const provided = fromHeader || fromQuery;
  if (configured && provided && provided === configured) return null;

  return unauthorized(req);
}

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

const TOOLS = [
  {
    name: "get_meta_accounts",
    description:
      "Liest alle Meta-Werbekonten (read-only), inkl. zugeordneter Slack-Row/Kunde und letztem lokalen Sync-Zeitpunkt. Keine Parameter.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_meta_kpi_report",
    description:
      "Aggregierter KPI-Report für einen Zeitraum: Spend, Ergebnisse (nach fester Prioritätsliste, kein Doppelzählen), CPL, CTR, CPC, Impressions, Reach, CPM + Top-3 Creatives + kurzer deutscher kundentext. Ohne account_id: alle aktiven Accounts.",
    inputSchema: {
      type: "object",
      properties: {
        since: { type: "string", description: "Startdatum YYYY-MM-DD" },
        until: { type: "string", description: "Enddatum YYYY-MM-DD" },
        account_id: {
          type: "string",
          description: "Optional: act_1234... oder 1234... — schränkt Report auf ein Konto ein.",
        },
      },
      required: ["since", "until"],
      additionalProperties: false,
    },
  },
  {
    name: "search_meta_payments",
    description:
      "Sucht Meta-Zahlungsbelege ZUERST lokal (Supabase). Nur wenn 0 lokale Treffer UND allow_gmail_search=true wird der n8n Gmail-Suche-Webhook getriggert und liefert Vorschläge zurück (kein Auto-Import).",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
        amount: { type: "number" },
        meta_account_id: { type: "string" },
        account_name: { type: "string" },
        allow_gmail_search: { type: "boolean", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "diagnose_meta_billing",
    description:
      "Diagnose zur Billing-Anbindung: nur Booleans/Status (hat_billing_token, business_invoices_erreichbar, letzter_erfolgreicher_payment_import, anzahl_payments_lokal). Gibt niemals Token-Werte oder Fragmente zurück. Keine Parameter.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function runTool(name: string, args: any): Promise<ConnectorResult> {
  switch (name) {
    case "get_meta_accounts": return await fetchAccounts();
    case "get_meta_kpi_report": return await fetchKpiReport(args ?? {});
    case "search_meta_payments": return await searchPayments(args ?? {});
    case "diagnose_meta_billing": return await billingDiagnose();
    default:
      return {
        success: false, data: null, error: "unknown_tool",
        diagnostics: { requested: name },
      };
  }
}

function rpcResult(id: any, result: any) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;
  try {
    if (method === "initialize") {
      const clientProtocol = params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
      return rpcResult(id, {
        protocolVersion: clientProtocol,
        capabilities: { tools: {} },
        serverInfo: { name: "claude-meta-connector", version: "1.0.0" },
      });
    }
    if (method?.startsWith("notifications/")) return null;
    if (method === "ping") return rpcResult(id, {});
    if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments ?? {};
      const data = await runTool(toolName, args);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        isError: !data.success,
      });
    }
    if (isNotification) return null;
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e: any) {
    if (isNotification) return null;
    return rpcError(id ?? null, -32603, e?.message ?? "Internal error");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);

  // Public discovery endpoints — no auth.
  if (url.pathname.endsWith("/.well-known/oauth-protected-resource")) {
    return jsonResponse(protectedResourceMetadata(req));
  }

  const unauth = await checkAuth(req);
  if (unauth) return unauth;

  if (req.method === "GET") {
    return jsonResponse({
      ok: true,
      server: "claude-meta-connector",
      transport: "streamable-http",
      auth: "OAuth 2.1 Bearer (Supabase) — legacy x-api-key/?key= also accepted.",
    });
  }
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleRpc))).filter((r) => r !== null);
    if (!out.length) return new Response(null, { status: 202, headers: corsHeaders });
    return jsonResponse(out);
  }

  const res = await handleRpc(body);
  if (res === null) return new Response(null, { status: 202, headers: corsHeaders });
  return jsonResponse(res);
});
