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
    const { slack_item_id, slack_list_id, field_updates, column_types } = await req.json();
    if (!slack_item_id || !slack_list_id || !field_updates) {
      return new Response(JSON.stringify({ error: "missing params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("SLACK_BOT_TOKEN");
    if (!token) throw new Error("SLACK_BOT_TOKEN not configured");

    const types: Record<string, string> = column_types || {};

    function buildCell(column_id: string, value: unknown): Record<string, unknown> {
      const t = types[column_id] || "text";
      switch (t) {
        case "select":
          return { column_id, select: value ? [String(value)] : [] };
        case "multi_select":
          return { column_id, select: Array.isArray(value) ? value.map(String) : [] };
        case "checkbox":
          return { column_id, checkbox: value === true };
        case "date": {
          const n = typeof value === "number"
            ? value
            : Math.floor(new Date(String(value)).getTime() / 1000);
          return { column_id, date: n };
        }
        case "number":
          return { column_id, value: value === null || value === "" ? null : Number(value) };
        case "user":
          return { column_id, user: Array.isArray(value) ? value : [String(value)] };
        case "link":
          return { column_id, value: String(value ?? "") };
        case "rich_text":
        case "text":
        default:
          return { column_id, text: String(value ?? "") };
      }
    }

    const cells = Object.entries(field_updates as Record<string, unknown>).map(
      ([column_id, value]) => buildCell(column_id, value),
    );

    const res = await fetch("https://slack.com/api/slackLists.items.update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ list_id: slack_list_id, id: slack_item_id, cells }),
    });
    const data = await res.json();

    if (!data.ok) {
      if (data.error === "missing_scope")
        throw new Error("Bitte lists:write in Slack App ergänzen");
      if (data.error === "invalid_auth") throw new Error("Slack-Token ungültig");
      throw new Error(`Slack error: ${data.error}`);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Merge fields into local row
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
      JSON.stringify({ success: true, updated_at: updatedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
