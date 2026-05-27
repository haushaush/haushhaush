import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const toKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { slack_list_id, slack_item_id, field_updates } = await req.json();
    if (!slack_item_id || !field_updates) {
      return new Response(JSON.stringify({ error: "missing params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_VORQUALI_UPDATE");
    if (!webhookUrl) throw new Error("SLACK_WEBHOOK_VORQUALI_UPDATE not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load list columns
    let columns: any[] = [];
    if (slack_list_id) {
      const { data: list } = await supabase
        .from("slack_lists")
        .select("columns")
        .eq("slack_list_id", slack_list_id)
        .maybeSingle();
      columns = (list?.columns as any[]) || [];
    }
    const columnsMap = new Map(columns.map((c: any) => [c.id, c]));

    // Load Hub aliases for column display names
    const aliasMap = new Map<string, string>();
    if (slack_list_id) {
      const { data: aliases } = await supabase
        .from("slack_list_aliases")
        .select("slack_id, display_name")
        .eq("slack_list_id", slack_list_id)
        .eq("alias_type", "column");
      for (const a of aliases || []) {
        if (a.slack_id && a.display_name) aliasMap.set(a.slack_id, a.display_name);
      }
    }

    const getVariableKey = (column: any, fallbackId: string) => {
      const displayName =
        aliasMap.get(fallbackId) ||
        column?.name ||
        fallbackId;
      return toKey(String(displayName));
    };

    const mappedUpdates: Record<string, unknown> = {};
    for (const [colId, value] of Object.entries(field_updates as Record<string, unknown>)) {
      const column: any = columnsMap.get(colId);
      const variableKey = getVariableKey(column, colId);
      const type = column?.type || "text";

      let mapped: unknown;
      switch (type) {
        case "select":
          mapped = Array.isArray(value) ? value[0] : value;
          break;
        case "multi_select":
          mapped = Array.isArray(value) ? value : value == null ? [] : [value];
          break;
        case "checkbox":
          mapped = Boolean(value);
          break;
        case "number":
          mapped = value === null || value === "" ? null : Number(value);
          break;
        case "date":
          mapped = typeof value === "number"
            ? value
            : Math.floor(new Date(String(value)).getTime() / 1000);
          break;
        default:
          mapped = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      }

      mappedUpdates[variableKey] = mapped;
    }

    console.log("[send-update] Column → Variable-Key mapping:",
      Object.entries(field_updates as Record<string, unknown>).map(([colId]) => {
        const column: any = columnsMap.get(colId);
        return {
          column_id: colId,
          slack_column_name: column?.name,
          hub_alias: aliasMap.get(colId),
          resolved_variable_key: getVariableKey(column, colId),
          type: column?.type,
        };
      }),
    );

    const body = {
      item_id: slack_item_id,
      ...mappedUpdates,
    };

    console.log("[send-update] Final webhook body:", JSON.stringify(body, null, 2));

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const respText = await response.text();
    console.log("[send-update] response", response.status, respText);

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${respText}`);
    }

    // Optimistic local update
    const { data: existing } = await supabase
      .from("slack_list_items")
      .select("fields")
      .eq("slack_item_id", slack_item_id)
      .maybeSingle();

    const mergedFields = {
      ...((existing?.fields as Record<string, unknown>) || {}),
      ...(field_updates as Record<string, unknown>),
    };

    const updatedAt = new Date().toISOString();
    await supabase
      .from("slack_list_items")
      .update({ fields: mergedFields, synced_at: updatedAt })
      .eq("slack_item_id", slack_item_id);

    return new Response(
      JSON.stringify({ success: true, webhook_called: true, updated_at: updatedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[send-update] error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
