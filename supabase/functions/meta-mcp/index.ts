// Meta Ads MCP Server (read-only) — Streamable HTTP transport, JSON-RPC 2.0
// Auth: shared secret via ?key= or x-mcp-key header (MCP_ACCESS_KEY).
// Uses existing META_ACCESS_TOKEN / META_BUSINESS_ID secrets. Read-only Graph API calls only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mcp-key, mcp-session-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id",
};

const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY");
const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const META_BUSINESS_ID = Deno.env.get("META_BUSINESS_ID");
const API_VERSION = "v19.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// ---------- Tool definitions ----------
const TOOLS = [
  {
    name: "list_ad_accounts",
    description:
      "List Meta ad accounts the connected access token can see (read-only). Returns id, name, currency, status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_campaigns",
    description: "List campaigns for an ad account (read-only).",
    inputSchema: {
      type: "object",
      properties: {
        account_id: {
          type: "string",
          description: "Ad account id, e.g. act_123456789 or 123456789.",
        },
      },
      required: ["account_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_adsets",
    description: "List ad sets in an ad account, optionally filtered by campaign_id.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        campaign_id: { type: "string" },
      },
      required: ["account_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_ads",
    description: "List ads in an ad account, optionally filtered by adset_id.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        adset_id: { type: "string" },
      },
      required: ["account_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_insights",
    description:
      "Get aggregated read-only performance insights (spend, results, cost_per_result, frequency, reach, impressions, ctr, cpm, cpc, attribution window). No personal lead data.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "string" },
        level: { type: "string", enum: ["account", "campaign", "adset", "ad"] },
        object_id: {
          type: "string",
          description: "Optional specific campaign/adset/ad id to scope to.",
        },
        date_preset: {
          type: "string",
          description: "e.g. last_7d, last_30d, last_90d, maximum. Ignored if time_range given.",
        },
        time_range: {
          type: "object",
          properties: {
            since: { type: "string", description: "YYYY-MM-DD" },
            until: { type: "string", description: "YYYY-MM-DD" },
          },
          required: ["since", "until"],
          additionalProperties: false,
        },
      },
      required: ["account_id", "level"],
      additionalProperties: false,
    },
  },
];

// ---------- Graph helpers ----------
function normalizeAct(id: string): string {
  return id.startsWith("act_") ? id : `act_${id}`;
}

async function graphGet(path: string, params: Record<string, string> = {}) {
  if (!META_ACCESS_TOKEN) throw new Error("META_ACCESS_TOKEN not configured");
  const url = new URL(`${GRAPH}${path.startsWith("/") ? path : `/${path}`}`);
  url.searchParams.set("access_token", META_ACCESS_TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || data?.error) {
    const msg = data?.error?.message || `Graph API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

async function graphGetAllPages(path: string, params: Record<string, string> = {}, max = 500) {
  const results: any[] = [];
  let next: string | null = null;
  let first = true;
  while (first || next) {
    let data: any;
    if (first) {
      data = await graphGet(path, { ...params, limit: "100" });
      first = false;
    } else {
      const res = await fetch(next as string);
      data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.error?.message || "Graph paging error");
    }
    if (Array.isArray(data.data)) results.push(...data.data);
    next = data?.paging?.next ?? null;
    if (results.length >= max) break;
  }
  return results.slice(0, max);
}

// ---------- Tool handlers ----------
async function toolListAdAccounts() {
  const fields = "id,account_id,name,currency,account_status";
  const collected: any[] = [];
  if (META_BUSINESS_ID) {
    for (const edge of ["owned_ad_accounts", "client_ad_accounts"]) {
      try {
        const rows = await graphGetAllPages(`/${META_BUSINESS_ID}/${edge}`, { fields });
        collected.push(...rows);
      } catch (_e) { /* ignore individual edge failures */ }
    }
  }
  if (collected.length === 0) {
    const rows = await graphGetAllPages(`/me/adaccounts`, { fields });
    collected.push(...rows);
  }
  const map = new Map<string, any>();
  for (const a of collected) {
    const id = a.id || `act_${a.account_id}`;
    map.set(id, {
      id,
      name: a.name ?? null,
      currency: a.currency ?? null,
      status: a.account_status === 1 ? "active" : "inactive",
    });
  }
  return Array.from(map.values()).sort((x, y) => (x.name ?? "").localeCompare(y.name ?? ""));
}

async function toolListCampaigns(args: any) {
  const act = normalizeAct(String(args.account_id));
  const rows = await graphGetAllPages(`/${act}/campaigns`, {
    fields: "id,name,status,objective",
  });
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    objective: r.objective,
  }));
}

async function toolListAdSets(args: any) {
  const act = normalizeAct(String(args.account_id));
  const params: Record<string, string> = { fields: "id,name,status,campaign_id" };
  if (args.campaign_id) {
    params.filtering = JSON.stringify([
      { field: "campaign.id", operator: "EQUAL", value: String(args.campaign_id) },
    ]);
  }
  const rows = await graphGetAllPages(`/${act}/adsets`, params);
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    campaign_id: r.campaign_id,
  }));
}

async function toolListAds(args: any) {
  const act = normalizeAct(String(args.account_id));
  const params: Record<string, string> = { fields: "id,name,status,adset_id" };
  if (args.adset_id) {
    params.filtering = JSON.stringify([
      { field: "adset.id", operator: "EQUAL", value: String(args.adset_id) },
    ]);
  }
  const rows = await graphGetAllPages(`/${act}/ads`, params);
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    adset_id: r.adset_id,
  }));
}

async function toolGetInsights(args: any) {
  const level = String(args.level);
  if (!["account", "campaign", "adset", "ad"].includes(level)) {
    throw new Error("Invalid level. Must be one of: account, campaign, adset, ad");
  }
  const target = args.object_id ? String(args.object_id) : normalizeAct(String(args.account_id));
  const params: Record<string, string> = {
    level,
    fields:
      "spend,impressions,reach,frequency,ctr,cpm,cpc,actions,cost_per_action_type",
  };
  if (args.time_range) {
    params.time_range = JSON.stringify({
      since: args.time_range.since,
      until: args.time_range.until,
    });
  } else if (args.date_preset) {
    params.date_preset = String(args.date_preset);
  } else {
    params.date_preset = "last_30d";
  }
  const data = await graphGet(`/${target}/insights`, params);
  const rows: any[] = Array.isArray(data.data) ? data.data : [];

  const aggregated = rows.map((r: any) => {
    const actions: any[] = Array.isArray(r.actions) ? r.actions : [];
    const cpa: any[] = Array.isArray(r.cost_per_action_type) ? r.cost_per_action_type : [];
    const resultAction =
      actions.find((a) => a.action_type === "lead") ??
      actions.find((a) => a.action_type === "offsite_conversion.fb_pixel_lead") ??
      actions.find((a) => a.action_type === "onsite_conversion.lead_grouped") ??
      null;
    const results = resultAction ? Number(resultAction.value) : null;
    const cprAction = resultAction
      ? cpa.find((c) => c.action_type === resultAction.action_type)
      : null;
    const cost_per_result = cprAction ? Number(cprAction.value) : null;
    return {
      date_start: r.date_start,
      date_stop: r.date_stop,
      spend: r.spend != null ? Number(r.spend) : null,
      impressions: r.impressions != null ? Number(r.impressions) : null,
      reach: r.reach != null ? Number(r.reach) : null,
      frequency: r.frequency != null ? Number(r.frequency) : null,
      ctr: r.ctr != null ? Number(r.ctr) : null,
      cpm: r.cpm != null ? Number(r.cpm) : null,
      cpc: r.cpc != null ? Number(r.cpc) : null,
      results,
      result_type: resultAction?.action_type ?? null,
      cost_per_result,
      attribution_window: "default (7d_click, 1d_view)",
    };
  });

  return { level, target, rows: aggregated };
}

async function runTool(name: string, args: any) {
  switch (name) {
    case "list_ad_accounts": return await toolListAdAccounts();
    case "list_campaigns":   return await toolListCampaigns(args ?? {});
    case "list_adsets":      return await toolListAdSets(args ?? {});
    case "list_ads":         return await toolListAds(args ?? {});
    case "get_insights":     return await toolGetInsights(args ?? {});
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- JSON-RPC ----------
function rpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: any, code: number, message: string, data?: any) {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
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
        serverInfo: { name: "meta-ads-readonly", version: "1.0.0" },
      });
    }
    if (method === "notifications/initialized" || method?.startsWith("notifications/")) {
      return null; // notification
    }
    if (method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }
    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments ?? {};
      try {
        const data = await runTool(toolName, args);
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        });
      } catch (e: any) {
        return rpcResult(id, {
          content: [{ type: "text", text: `Error: ${e?.message ?? String(e)}` }],
          isError: true,
        });
      }
    }
    if (method === "ping") {
      return rpcResult(id, {});
    }
    if (isNotification) return null;
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e: any) {
    if (isNotification) return null;
    return rpcError(id ?? null, -32603, e?.message ?? "Internal error");
  }
}

// ---------- HTTP entry ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth
  if (!MCP_ACCESS_KEY) {
    return json({ error: "MCP_ACCESS_KEY not configured" }, 500);
  }
  const url = new URL(req.url);
  const key = req.headers.get("x-mcp-key") ?? url.searchParams.get("key");
  if (key !== MCP_ACCESS_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      server: "meta-ads-readonly",
      transport: "streamable-http",
      hint: "POST JSON-RPC 2.0 messages to this endpoint.",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map(handleRpc))).filter((r) => r !== null);
    if (responses.length === 0) return new Response(null, { status: 202, headers: corsHeaders });
    return json(responses);
  }

  const response = await handleRpc(body);
  if (response === null) return new Response(null, { status: 202, headers: corsHeaders });
  return json(response);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
