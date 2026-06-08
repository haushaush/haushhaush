import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
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
      "Content-Type": "application/json",
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

  // Cron-Secret bypass (for n8n external triggers)
  const CRON_SECRET = Deno.env.get("CRON_TRIGGER_SECRET");
  const incomingCronSecret = req.headers.get("x-cron-secret");
  let isCronTrigger = false;
  if (CRON_SECRET && incomingCronSecret === CRON_SECRET) {
    isCronTrigger = true;
    console.log("[cron-daily] sync-slack-list authenticated via X-Cron-Secret header");
  }
  const triggerSource = isCronTrigger ? "cron-daily" : "manual";

  const t0 = Date.now();
  try {
    const { list_id } = await req.json();
    console.log("[sync-slack-list] trigger:", triggerSource, "list_id:", list_id);
    if (!list_id) {
      return new Response(JSON.stringify({ error: "list_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const debug = new URL(req.url).searchParams.get("debug") === "1";


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
    const debugProbes: any[] = [];

    if (debug) {
      const probeItems = await slackPost("slackLists.items.list", token, { list_id, limit: 2 });
      debugProbes.push({ method: "items.list.sample_item", sample: probeItems.items?.[0] || null, env_keys: Object.keys(probeItems) });
      for (const m of ["slackLists.list","slackLists.get","slackLists.schema","slackLists.fields.list","slackLists.items.info","slackLists.columns","slackLists.metadata"]) {
        const r = await slackPost(m, token, { list_id, id: probeItems.items?.[0]?.id });
        debugProbes.push({ method: m, ok: r.ok, error: r.error, keys: r.ok ? Object.keys(r) : null });
      }
    }


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

    // 3. If no schema was retrievable from any metadata endpoint, aggregate
    //    column definitions from ALL items (so empty columns aren't lost).
    if (columns.length === 0 && items.length > 0) {
      const seen = new Map<string, any>();
      const FRIENDLY: Record<string, string> = {
        name: "Name",
        todo_completed: "Erledigt",
      };
      let order = 0;
      for (const it of items) {
        const cells = it.fields || it.cells || [];
        for (const c of cells as any[]) {
          if (!c.column_id) continue;
          const existing = seen.get(c.column_id);
          // Infer type from cell shape
          let type: string | null = existing?.type ?? null;
          if (!type) {
            if ("checkbox" in c) type = "checkbox";
            else if (Array.isArray((c as any).select)) type = "select";
            else if ((c as any).rich_text) type = "rich_text";
            else if ((c as any).user) type = "user";
            else if ((c as any).date) type = "date";
          }
          if (!existing) {
            const key: string | undefined = (c as any).key;
            const friendly = key && FRIENDLY[key];
            seen.set(c.column_id, {
              id: c.column_id,
              name: friendly || key || c.column_id,
              type,
              options: null,
              is_primary_column: c.column_id === "Col00",
              position: order++,
            });
          } else if (type && !existing.type) {
            existing.type = type;
          }
        }
      }
      columns = Array.from(seen.values());
      // Put primary (system "Col00" completed checkbox) first
      columns.sort((a, b) =>
        Number(b.is_primary_column) - Number(a.is_primary_column) || a.position - b.position,
      );
      rawSchemaSrc = "items.aggregate";
      console.log("[sync-slack-list] schema aggregated from items", {
        count: columns.length,
        names: columns.map((c) => c.name),
      });
    }

    // 3b. Aggregate observed option_ids per select column → options.choices.
    //     Slack's bot API does NOT expose option labels/colors, so we store
    //     the id as a placeholder label. Existing user-renamed labels in DB
    //     are preserved across syncs.
    const selectChoiceIds = new Map<string, Set<string>>();
    for (const it of items) {
      const cells = (it.fields || it.cells || []) as any[];
      for (const c of cells) {
        if (!c.column_id) continue;
        const sel = (c as any).select;
        const ids: string[] = Array.isArray(sel)
          ? sel.filter((x: unknown) => typeof x === "string")
          : (typeof c.value === "string" && /^Opt[A-Z0-9]+$/.test(c.value) ? [c.value] : []);
        if (ids.length === 0) continue;
        const col = columns.find((cc) => cc.id === c.column_id);
        if (col && !col.type) col.type = "select";
        if (!selectChoiceIds.has(c.column_id)) selectChoiceIds.set(c.column_id, new Set());
        for (const id of ids) selectChoiceIds.get(c.column_id)!.add(id);
      }
    }

    const { data: existingRow } = await supabase
      .from("slack_lists")
      .select("columns")
      .eq("slack_list_id", list_id)
      .maybeSingle();
    const existingChoices = new Map<string, Map<string, any>>();
    if (existingRow?.columns && Array.isArray(existingRow.columns)) {
      for (const c of existingRow.columns as any[]) {
        const choices = c?.options?.choices;
        if (Array.isArray(choices)) {
          const m = new Map<string, any>();
          for (const ch of choices) {
            if (ch?.id) m.set(ch.id, ch);
          }
          existingChoices.set(c.id, m);
        }
      }
    }

    for (const col of columns) {
      if (col.type !== "select" && col.type !== "multi_select") continue;
      const seen = selectChoiceIds.get(col.id) || new Set<string>();
      const prior = existingChoices.get(col.id) || new Map<string, any>();
      const allIds = new Set<string>([...prior.keys(), ...seen]);
      const choices = Array.from(allIds).map((id) => {
        const p = prior.get(id);
        return { id, label: p?.label || id, color: p?.color || "gray" };
      });
      (col as any).options = { choices };
    }

    // 4. Upsert slack_lists row — preserve existing columns if discovery failed
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

    // 4b. Auto-populate slack_list_aliases for columns/options where Slack
    //     gave us a real name. Uses upsert so user-set values are not lost
    //     across syncs (PK conflict updates display_name only when Slack
    //     still provides a meaningful, non-ID label).
    const aliasRows: any[] = [];
    for (const col of columns) {
      if (col.name && col.name !== col.id && !/^Col[A-Z0-9]+$/.test(col.name)) {
        aliasRows.push({
          slack_list_id: list_id,
          alias_type: "column",
          slack_id: col.id,
          parent_column_id: null,
          display_name: col.name,
        });
      }
      const choices: any[] = Array.isArray((col as any).options?.choices)
        ? (col as any).options.choices
        : [];
      for (const ch of choices) {
        if (!ch?.id || !ch?.label || ch.label === ch.id) continue;
        aliasRows.push({
          slack_list_id: list_id,
          alias_type: "option",
          slack_id: ch.id,
          parent_column_id: col.id,
          display_name: ch.label,
          display_color: ch.color || "gray",
        });
      }
    }
    if (aliasRows.length > 0) {
      const { error: aliasErr } = await supabase
        .from("slack_list_aliases")
        .upsert(aliasRows, { onConflict: "slack_list_id,slack_id,parent_column_id" });
      if (aliasErr) console.warn("[sync-slack-list] alias upsert failed", aliasErr);
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
        debug_probes: debug ? debugProbes : undefined,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
