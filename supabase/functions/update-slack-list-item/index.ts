// DEPRECATED: replaced by send-slack-list-update (workflow webhook)
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

    function richText(text: string) {
      return [{
        type: "rich_text",
        elements: [{
          type: "rich_text_section",
          elements: [{ type: "text", text }],
        }],
      }];
    }

    function buildCell(column_id: string, value: unknown): Record<string, unknown> {
      const t = types[column_id] || "text";
      const base = { column_id, row_id: slack_item_id };
      switch (t) {
        case "select":
          return { ...base, select: value ? [String(value)] : [] };
        case "multi_select":
          return { ...base, select: Array.isArray(value) ? value.map(String) : [] };
        case "checkbox":
          return { ...base, checkbox: value === true };
        case "date": {
          let dateStr: string;
          if (typeof value === "number") {
            dateStr = new Date(value * 1000).toISOString().slice(0, 10);
          } else {
            const d = new Date(String(value));
            dateStr = isNaN(d.getTime()) ? String(value) : d.toISOString().slice(0, 10);
          }
          return { ...base, date: [dateStr] };
        }
        case "number":
          return { ...base, number: value === null || value === "" ? null : Number(value) };
        case "user":
          return { ...base, user: Array.isArray(value) ? value.map(String) : [String(value)] };
        case "rich_text":
        case "text":
        case "link":
        default:
          return { ...base, rich_text: richText(String(value ?? "")) };
      }
    }

    const cells = Object.entries(field_updates as Record<string, unknown>).map(
      ([column_id, value]) => buildCell(column_id, value),
    );

    const res = await fetch("https://slack.com/api/slackLists.items.update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        list_id: slack_list_id,
        id: slack_item_id,
        cells,
      }),
    });
    const responseText = await res.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`Slack returned non-JSON: ${responseText}`);
    }
    console.log("[update] Slack response:", data);

    if (!data.ok) {
      console.error("slackLists.items.update failed", { slack_list_id, slack_item_id, cells, error: data.error, response: data });
      if (data.error === "missing_scope")
        throw new Error("Bitte lists:write Scope in Slack App ergänzen und neu autorisieren");
      if (data.error === "invalid_auth") throw new Error("Slack-Token ungültig");
      if (data.error === "list_not_found")
        throw new Error("Liste nicht gefunden. Bot muss zur Liste eingeladen werden (in Slack: Liste öffnen → Share → Bot hinzufügen) und 'lists:write' Scope braucht es.");
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
