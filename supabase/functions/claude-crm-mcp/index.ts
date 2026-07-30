// CRM MCP Server (JSON-RPC 2.0 over HTTP), read-only.
// Database access happens EXCLUSIVELY through CRM_RO_DATABASE_URL (read-only role).
// No Supabase client, no service role key — the read-only role is the security boundary.

import postgres from "https://esm.sh/postgres@3.4.5?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const MAX_ROWS = 200;
const MAX_TEXT = 400_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---- DB ---------------------------------------------------------------
let sqlClient: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sqlClient) {
    const url = Deno.env.get("CRM_RO_DATABASE_URL");
    if (!url) throw new Error("CRM_RO_DATABASE_URL is not configured");
    sqlClient = postgres(url, { max: 2, prepare: false });
  }
  return sqlClient;
}

// ---- Tools ------------------------------------------------------------
const TOOLS = [
  {
    name: "crm_schema",
    description:
      "Immer zuerst aufrufen, Tabellennamen nicht raten. Listet Tabellen des Schemas 'public' mit Spalten und Datentypen.",
    inputSchema: {
      type: "object",
      properties: {
        tabelle: {
          type: "string",
          description: "Optional: nur diese Tabelle anzeigen.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "crm_query",
    description:
      "Führt eine einzelne read-only SELECT- oder WITH-Abfrage gegen das CRM aus. Maximal 200 Zeilen; für Gesamtzahlen count(*) verwenden.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Eine einzelne SELECT/WITH-Abfrage." },
      },
      required: ["sql"],
      additionalProperties: false,
    },
  },
];

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do|refresh)\b/i;

function validateSql(raw: unknown): string {
  const sql = typeof raw === "string" ? raw.trim() : "";
  if (!sql) throw new Error("Fehler: sql darf nicht leer sein.");
  const body = sql.replace(/;+\s*$/, "");
  if (body.includes(";")) {
    throw new Error("Fehler: Nur eine einzelne Anweisung erlaubt (kein Semikolon im Rumpf).");
  }
  if (!/^(select|with)\b/i.test(body)) {
    throw new Error("Fehler: Die Abfrage muss mit SELECT oder WITH beginnen.");
  }
  if (FORBIDDEN.test(body)) {
    throw new Error(
      "Fehler: Schreibende oder DDL-Schlüsselwörter sind nicht erlaubt (nur lesende Abfragen).",
    );
  }
  return body;
}

function truncate(text: string): string {
  return text.length > MAX_TEXT
    ? text.slice(0, MAX_TEXT) + "\n… [Ausgabe bei 400000 Zeichen abgeschnitten]"
    : text;
}

async function crmSchema(args: any): Promise<string> {
  const sql = db();
  const tabelle = typeof args?.tabelle === "string" ? args.tabelle.trim() : "";
  const rows = tabelle
    ? await sql`
        select table_name, column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public' and table_name = ${tabelle}
        order by table_name, ordinal_position`
    : await sql`
        select table_name, column_name, data_type, is_nullable
        from information_schema.columns
        where table_schema = 'public'
        order by table_name, ordinal_position`;

  if (!rows.length) {
    return tabelle
      ? `Keine Tabelle "${tabelle}" im Schema public sichtbar.`
      : "Keine Tabellen im Schema public sichtbar.";
  }
  const grouped = new Map<string, string[]>();
  for (const r of rows as any[]) {
    const list = grouped.get(r.table_name) ?? [];
    list.push(
      `  - ${r.column_name}: ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}`,
    );
    grouped.set(r.table_name, list);
  }
  return truncate(
    [...grouped.entries()]
      .map(([t, cols]) => `${t}\n${cols.join("\n")}`)
      .join("\n\n"),
  );
}

async function crmQuery(args: any): Promise<string> {
  const body = validateSql(args?.sql);
  const sql = db();
  const rows = await sql.unsafe(`${body}\nlimit ${MAX_ROWS + 1}`);
  const truncated = rows.length > MAX_ROWS;
  const out = truncated ? rows.slice(0, MAX_ROWS) : rows;
  let text = JSON.stringify(out, null, 2);
  if (truncated) {
    text +=
      `\n\nHinweis: Ergebnis auf ${MAX_ROWS} Zeilen gekürzt. Für Gesamtzahlen count(*) verwenden statt alle Zeilen abzufragen.`;
  }
  return truncate(text);
}

// ---- JSON-RPC ---------------------------------------------------------
function rpcResult(id: any, result: any) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: any, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(msg: any): Promise<any | null> {
  const { id, method, params } = msg ?? {};
  const isNotification = id === undefined || id === null;
  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "crm", version: "1.0.0" },
      });
    }
    if (typeof method === "string" && method.startsWith("notifications/")) return null;
    if (method === "ping") return rpcResult(id, {});
    if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
    if (method === "tools/call") {
      const name = params?.name;
      const args = params?.arguments ?? {};
      try {
        let text: string;
        if (name === "crm_schema") text = await crmSchema(args);
        else if (name === "crm_query") text = await crmQuery(args);
        else throw new Error(`Unbekanntes Tool: ${name}`);
        return rpcResult(id, { content: [{ type: "text", text }] });
      } catch (e: any) {
        // Postgres-Fehlermeldungen unverändert durchreichen.
        return rpcResult(id, {
          content: [{ type: "text", text: String(e?.message ?? e) }],
          isError: true,
        });
      }
    }
    if (isNotification) return null;
    return rpcError(id, -32601, `Method not found: ${method}`);
  } catch (e: any) {
    if (isNotification) return null;
    return rpcError(id ?? null, -32603, e?.message ?? "Internal error");
  }
}

// ---- HTTP -------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth zuerst — vor jeder anderen Verarbeitung.
  const secret = Deno.env.get("CRM_MCP_SECRET");
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!secret || !token || token !== secret) {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } }, 401);
  }

  if (req.method === "GET") {
    return json({ ok: true, server: "crm", transport: "streamable-http" });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handleRpc))).filter((r) => r !== null);
    if (!out.length) return new Response(null, { status: 202, headers: corsHeaders });
    return json(out);
  }

  const res = await handleRpc(body);
  if (res === null) return new Response(null, { status: 202, headers: corsHeaders });
  return json(res);
});
