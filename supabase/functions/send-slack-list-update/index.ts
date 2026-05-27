import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Load list columns for type-aware mapping
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

    const toKey = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    const mappedUpdates: Record<string, unknown> = {};
    for (const [colId, value] of Object.entries(field_updates as Record<string, unknown>)) {
      const column: any = columnsMap.get(colId);
      const key = toKey(column?.name || colId);
      let mapped: unknown = value;

      if (column?.type === "select" || column?.type === "multi_select") {
        const choices: any[] = column.options?.choices || column.options?.values || column.options || [];
        const ids = Array.isArray(value) ? value : value == null ? [] : [value];
        const labels = ids.map((id) => {
          const choice = Array.isArray(choices) ? choices.find((c: any) => c.id === id) : null;
          return choice?.label || choice?.name || id;
        });
        mapped = labels.join(", ");
      } else if (column?.type === "checkbox") {
        mapped = value === true ? "true" : "false";
      } else if (column?.type === "date") {
        if (typeof value === "number") {
          mapped = new Date(value * 1000).toISOString().slice(0, 10);
        } else {
          mapped = String(value ?? "");
        }
      } else {
        mapped = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      }

      mappedUpdates[key] = mapped;
    }

    const body = {
      item_id: slack_item_id,
      ...mappedUpdates,
    };

    console.log("[send-update]", { slack_item_id, field_updates, webhook_body: body });

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
