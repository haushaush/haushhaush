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

    // 1. Fetch list metadata (info) to get columns + name
    let columns: unknown = null;
    let listName: string | null = null;
    const info = await slackPost("slackLists.info", token, { list_id });
    if (info.ok) {
      columns = info.list?.schema || info.list?.columns || null;
      listName = info.list?.name || info.list?.title || null;
    }

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

      cursor = data.response_metadata?.next_cursor || undefined;
      if (!cursor || cursor === "" || items.length >= 1000 || pageCount > 20) break;
    }

    // 3. Upsert slack_lists row
    await supabase
      .from("slack_lists")
      .upsert(
        {
          slack_list_id: list_id,
          list_name: listName,
          columns,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "slack_list_id" },
      );

    // 4. Map items and upsert
    const rows = items.map((it) => {
      const cells = it.fields || it.cells || [];
      const fields: Record<string, unknown> = {};
      for (const c of cells) {
        if (!c.column_id) continue;
        fields[c.column_id] = extractValue(c);
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
