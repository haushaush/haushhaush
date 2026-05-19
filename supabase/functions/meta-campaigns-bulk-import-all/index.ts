// Bulk-Import: iterate all clients with meta_account_id and import their campaigns
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: clients, error: clientsErr } = await svc
      .from("clients")
      .select("id, name, meta_account_id, meta_account_ids")
      .not("meta_account_id", "is", null);
    if (clientsErr) throw clientsErr;

    if (!clients || clients.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "Keine clients mit Meta-Account-ID gefunden",
          stats: { clients_processed: 0, accounts_processed: 0, campaigns_imported: 0, errors: 0 },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Unique account ID -> client id
    const accountToClient = new Map<string, string>();
    for (const c of clients as any[]) {
      const norm = (a: string) => (a.startsWith("act_") ? a : `act_${a}`);
      if (c.meta_account_id) accountToClient.set(norm(c.meta_account_id), c.id);
      if (Array.isArray(c.meta_account_ids)) {
        for (const aid of c.meta_account_ids) {
          if (aid && !accountToClient.has(norm(aid))) accountToClient.set(norm(aid), c.id);
        }
      }
    }

    const stats = {
      clients_processed: clients.length,
      accounts_total: accountToClient.size,
      accounts_processed: 0,
      campaigns_imported: 0,
      campaigns_skipped: 0,
      errors: 0,
      error_details: [] as Array<{ account_id: string; error: string }>,
    };

    for (const [accountId, _clientId] of accountToClient.entries()) {
      try {
        // 1. List importable campaigns for this account
        const listResp = await fetch(
          `${SUPABASE_URL}/functions/v1/meta-campaigns-list-importable`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ accountId, limit: 50, status: "ALL" }),
          },
        );

        if (!listResp.ok) {
          const txt = await listResp.text();
          stats.errors++;
          stats.error_details.push({ account_id: accountId, error: `list ${listResp.status}: ${txt.slice(0, 200)}` });
          continue;
        }

        const listData = await listResp.json();
        const importable = (listData.campaigns || []).filter((c: any) => !c.already_imported);

        if (importable.length === 0) {
          stats.accounts_processed++;
          continue;
        }

        const campaignIds = importable.map((c: any) => c.meta_campaign_id);

        // 2. Import campaigns in one call
        const importResp = await fetch(
          `${SUPABASE_URL}/functions/v1/meta-campaigns-import-to-showcase`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ campaignIds, datePreset: "maximum" }),
          },
        );

        if (importResp.ok) {
          const importData = await importResp.json();
          stats.campaigns_imported += (importData.imported || []).length;
          stats.campaigns_skipped += (importData.errors || []).length;
        } else {
          const txt = await importResp.text();
          stats.errors++;
          stats.error_details.push({ account_id: accountId, error: `import ${importResp.status}: ${txt.slice(0, 200)}` });
        }

        stats.accounts_processed++;
      } catch (e: any) {
        stats.errors++;
        stats.error_details.push({ account_id: accountId, error: e.message });
      }
    }

    // 3. Backfill linked_client_id for all campaigns where missing
    try {
      const { data: campaigns } = await svc
        .from("referenz_meta_campaigns")
        .select("id, meta_account_id")
        .is("linked_client_id", null);

      if (campaigns && campaigns.length > 0) {
        let backfilled = 0;
        for (const camp of campaigns as any[]) {
          const acc = camp.meta_account_id;
          if (!acc) continue;
          const variants = [acc, acc.replace(/^act_/, ""), acc.startsWith("act_") ? acc : `act_${acc}`];
          const clientId = variants.map((v) => accountToClient.get(v.startsWith("act_") ? v : `act_${v}`)).find(Boolean);
          if (clientId) {
            const { error } = await svc
              .from("referenz_meta_campaigns")
              .update({ linked_client_id: clientId })
              .eq("id", camp.id);
            if (!error) backfilled++;
          }
        }
        (stats as any).backfilled_links = backfilled;
      }
    } catch (e) {
      console.warn("backfill failed:", (e as Error).message);
    }

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
