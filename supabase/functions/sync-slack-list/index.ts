import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SLACK_API = "https://slack.com/api";

interface SlackCell {
  column_id: string;
  key?: string;
  value?: unknown;
  text?: string;
  rich_text?: unknown;
}

interface SlackItem {
  id: string;
  fields?: SlackCell[];
  cells?: SlackCell[];
  date_created?: number;
}

async function slackPost(method: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

function extractCell(cell: SlackCell): unknown {
  // Preserve all representations so the frontend can render rich_text,
  // plain text fallback, booleans, selects, etc.
  const out: Record<string, unknown> = {};
  if (cell.value !== undefined) out.value = cell.value;
  if (cell.text !== undefined) out.text = cell.text;
  if (cell.rich_text !== undefined) out.rich_text = cell.rich_text;
  // If only one primitive remains, return it directly
  const keys = Object.keys(out);
  if (keys.length === 0) return null;
  if (keys.length === 1 && (typeof out[keys[0]] === 'string' || typeof out[keys[0]] === 'number' || typeof out[keys[0]] === 'boolean')) {
    return out[keys[0]];
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const { list_id } = await req.json();
    if (!list_id) {
      return new Response(JSON.stringify({ error: "list_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SLACK_BOT_TOKEN");
    if (!token) throw new Error("SLACK_BOT_TOKEN not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Fetch list metadata — try multiple methods (Slack Lists API is in flux)
    let columns: any[] = [];
    let listName: string | null = null;
    let rawSchemaSrc: any = null;

    const tryMethods = [
      "slackLists.info",
      "slackLists.read",
      "slackLists.columns.list",
      "conversations.info",
    ];
    for (const method of tryMethods) {
      const body: Record<string, unknown> = method === "conversations.info"
        ? { channel: list_id }
        : { list_id };
      const resp = await slackPost(method, token, body);
      console.log("[sync-slack-list] tried", method, {
        ok: resp.ok,
        error: resp.error,
        top_keys: resp.ok ? Object.keys(resp).slice(0, 10) : null,
      });
      if (!resp.ok) continue;

      const listObj = resp.list || resp.channel || resp;
      const rawSchema: any[] =
        listObj?.schema ||
        listObj?.columns ||
        listObj?.fields ||
        resp.columns ||
        resp.schema ||
        [];
      if (Array.isArray(rawSchema) && rawSchema.length > 0) {
        rawSchemaSrc = method;
        columns = rawSchema
          .map((c: any) => ({
            id: c.id || c.key || c.column_id,
            name: c.name || c.label || c.title || c.display_name || c.key || c.id,
            type: c.type || c.column_type || null,
            options: c.options || c.choices || null,
            is_primary_column: c.is_primary_column || false,
            position: c.position ?? c.order ?? null,
          }))
          .filter((c: any) => c.id);
        columns.sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
        listName = listObj?.name || listObj?.title || listName;
        break;
      }
      // even if no schema, capture the name if present
      if (!listName) listName = listObj?.name || listObj?.title || null;
    }

    console.log("[sync-slack-list] schema result", {
      list_id,
      source: rawSchemaSrc,
      list_name: listName,
      columns_count: columns.length,
      column_names: columns.map((c) => c.name),
    });



    // 2. Paginate items
    const items: SlackItem[] = [];
    let cursor: string | undefined = undefined;
    let retries = 0;
    let pageCount = 0;
    while (true) {
      const body: Record<string, unknown> = { list_id, limit: 100 };
      if (cursor) body.cursor = cursor;
      const data = await slackPost("slackLists.items.list", token, body);

      if (!data.ok) {
        if (data.error === "ratelimited" && retries < 3) {
          retries++;
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        if (data.error === "missing_scope")
          throw new Error("Bitte lists:read in Slack App ergänzen");
        if (data.error === "list_not_found") {
          await supabase.from("slack_lists").delete().eq("slack_list_id", list_id);
          return new Response(JSON.stringify({ error: "list_not_found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (data.error === "invalid_auth")
          throw new Error("Slack-Token ungültig (invalid_auth)");
        throw new Error(`Slack error: ${data.error}`);
      }
      retries = 0;

      const pageItems: SlackItem[] = data.items || [];
      items.push(...pageItems);
      pageCount++;

      // First page: try to extract schema from items.list envelope if we still have none
      if (pageCount === 1 && columns.length === 0) {
        console.log("[sync-slack-list] items.list envelope keys", Object.keys(data));
        const envSchema: any[] =
          data.list?.schema || data.list?.columns || data.schema || data.columns || [];
        if (Array.isArray(envSchema) && envSchema.length > 0) {
          columns = envSchema
            .map((c: any) => ({
              id: c.id || c.key || c.column_id,
              name: c.name || c.label || c.title || c.display_name || c.key || c.id,
              type: c.type || c.column_type || null,
              options: c.options || c.choices || null,
              is_primary_column: c.is_primary_column || false,
              position: c.position ?? c.order ?? null,
            }))
            .filter((c: any) => c.id);
          columns.sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
          if (!listName) listName = data.list?.name || data.list?.title || null;
          console.log("[sync-slack-list] schema from items envelope", {
            count: columns.length,
            names: columns.map((c) => c.name),
          });
        }
      }

      cursor = data.response_metadata?.next_cursor || undefined;
      if (!cursor || cursor === "" || items.length >= 1000 || pageCount > 20) break;
    }

    // 3. Upsert slack_lists row — preserve existing columns if schema fetch failed
    const upsertRow: Record<string, unknown> = {
      slack_list_id: list_id,
      last_synced_at: new Date().toISOString(),
    };
    if (listName) upsertRow.list_name = listName;
    if (columns.length > 0) upsertRow.columns = columns;
    await supabase
      .from("slack_lists")
      .upsert(upsertRow, { onConflict: "slack_list_id" });

    // 4. Map items and upsert
    const rows = items.map((it) => {
      const cells = it.fields || it.cells || [];
      const fields: Record<string, unknown> = {};
      for (const c of cells) {
        if (!c.column_id) continue;
        fields[c.column_id] = extractCell(c);
      }
      return {
        slack_item_id: it.id,
        slack_list_id: list_id,
        fields,
        date_created: it.date_created || null,
        synced_at: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      // Chunked upsert
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase
          .from("slack_list_items")
          .upsert(chunk, { onConflict: "slack_item_id" });
        if (error) throw error;
      }
    }

    const colCount = Array.isArray(columns)
      ? columns.length
      : columns && typeof columns === "object"
        ? Object.keys(columns).length
        : 0;

    return new Response(
      JSON.stringify({
        items_synced: rows.length,
        columns_count: colCount,
        duration_ms: Date.now() - t0,
        list_name: listName,
        remaining_cursor: cursor || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
