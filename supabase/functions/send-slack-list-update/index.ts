import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VORQUALI_LIST_ID = "F0B56EJPTEZ";

const toKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { slack_list_id, slack_item_id, field_updates } = await req.json();
    if (!slack_item_id || !field_updates || !slack_list_id) {
      return new Response(JSON.stringify({ error: "missing params (slack_list_id, slack_item_id, field_updates required)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load list config (webhook_url, variable_mapping, columns)
    const { data: list } = await supabase
      .from("slack_lists")
      .select("columns, webhook_url, variable_mapping")
      .eq("slack_list_id", slack_list_id)
      .maybeSingle();

    let webhookUrl: string | null = (list?.webhook_url as string | null) || null;
    const variableMapping: Record<string, string> =
      (list?.variable_mapping as Record<string, string> | null) || {};
    const columns: any[] = (list?.columns as any[]) || [];

    // Self-heal: backfill Vorquali webhook from legacy env secret on first run
    if (!webhookUrl && slack_list_id === VORQUALI_LIST_ID) {
      const legacy = Deno.env.get("SLACK_WEBHOOK_VORQUALI_UPDATE");
      if (legacy) {
        webhookUrl = legacy;
        await supabase
          .from("slack_lists")
          .update({ webhook_url: legacy })
          .eq("slack_list_id", slack_list_id);
        console.log("[send-update] Vorquali webhook backfilled from env into slack_lists.");
      }
    }

    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ error: "Keine Webhook-URL für diese Liste konfiguriert" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const columnsMap = new Map(columns.map((c: any) => [c.id, c]));

    // Load Hub aliases for column display names (fallback for unmapped columns)
    const aliasMap = new Map<string, string>();
    const { data: aliases } = await supabase
      .from("slack_list_aliases")
      .select("slack_id, display_name")
      .eq("slack_list_id", slack_list_id)
      .eq("alias_type", "column");
    for (const a of aliases || []) {
      if (a.slack_id && a.display_name) aliasMap.set(a.slack_id, a.display_name);
    }

    const getVariableKey = (column: any, colId: string) => {
      // Per-list mapping has priority
      if (variableMapping[colId]) return variableMapping[colId];
      const displayName = aliasMap.get(colId) || column?.name || colId;
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

    const body = {
      zeilenid: slack_item_id,
      ...mappedUpdates,
    };

    console.log("[send-update] Webhook body:", JSON.stringify(body, null, 2));

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

    // ---- Vorquali-only: update meta_campaign_snapshot on manual Status edits ----
    if (slack_list_id === VORQUALI_LIST_ID) {
      const STATUS_COL = "Col0B645A1WL8";
      const statusOptId = (field_updates as Record<string, unknown>)[STATUS_COL];
      if (statusOptId) {
        const { data: linkage } = await supabase
          .from("slack_item_meta_account")
          .select("meta_account_id")
          .eq("slack_item_id", slack_item_id)
          .maybeSingle();

        if (linkage?.meta_account_id) {
          let canonicalStatus: string;
          if (statusOptId === "OptARVJ11UU") canonicalStatus = "ACTIVE";
          else if (statusOptId === "OptH358HCYM") canonicalStatus = "PAUSED";
          else canonicalStatus = "UNKNOWN";

          const rawAcc = linkage.meta_account_id as string;
          const accId = rawAcc.startsWith("act_") ? rawAcc : `act_${rawAcc}`;
          const accIdAlt = rawAcc.startsWith("act_") ? rawAcc.slice(4) : rawAcc;

          const { error: snapshotError } = await supabase
            .from("meta_campaign_snapshot")
            .update({
              status: canonicalStatus,
              last_seen_at: new Date().toISOString(),
            })
            .in("account_id", [accId, accIdAlt]);

          if (snapshotError) {
            console.warn(
              `[send-update] Snapshot update failed (non-blocking) for item ${slack_item_id} / account ${rawAcc}:`,
              snapshotError.message,
            );
          } else {
            console.log(
              `[send-update] Snapshot updated → ${canonicalStatus} for item ${slack_item_id} (account ${rawAcc})`,
            );
          }
        }
      }
    }
    // ------------------------------------------------------------------

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
