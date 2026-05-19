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

    // Run the heavy work in the background so we return immediately
    // and avoid the 150s edge-function idle timeout.
    const work = async () => {
      const stats = {
        clients_processed: clients.length,
        accounts_total: accountToClient.size,
        accounts_processed: 0,
        campaigns_imported: 0,
        campaigns_skipped: 0,
        errors: 0,
      };

      for (const [accountId] of accountToClient.entries()) {
        try {
          const listResp = await fetch(
            `${SUPABASE_URL}/functions/v1/meta-campaigns-list-importable`,
            {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({ accountId, limit: 50, status: "ALL" }),
            },
          );
          if (!listResp.ok) {
            stats.errors++;
            console.warn(`[bulk] list failed ${accountId}: ${listResp.status}`);
            continue;
          }
          const listData = await listResp.json();
          const importable = (listData.campaigns || []).filter((c: any) => !c.already_imported);
          if (importable.length === 0) {
            stats.accounts_processed++;
            continue;
          }
          const campaignIds = importable.map((c: any) => c.meta_campaign_id);
          const importResp = await fetch(
            `${SUPABASE_URL}/functions/v1/meta-campaigns-import-to-showcase`,
            {
              method: "POST",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
              body: JSON.stringify({ campaignIds, datePreset: "maximum" }),
            },
          );
          if (importResp.ok) {
            const d = await importResp.json();
            stats.campaigns_imported += (d.imported || []).length;
            stats.campaigns_skipped += (d.errors || []).length;
          } else {
            stats.errors++;
          }
          stats.accounts_processed++;
        } catch (e: any) {
          stats.errors++;
          console.warn(`[bulk] account ${accountId} failed:`, e.message);
        }
      }

      // Backfill linked_client_id
      try {
        const { data: campaigns } = await svc
          .from("referenz_meta_campaigns")
          .select("id, meta_account_id")
          .is("linked_client_id", null);
        for (const camp of (campaigns ?? []) as any[]) {
          const acc = camp.meta_account_id;
          if (!acc) continue;
          const norm = acc.startsWith("act_") ? acc : `act_${acc}`;
          const clientId = accountToClient.get(norm);
          if (clientId) {
            await svc.from("referenz_meta_campaigns").update({ linked_client_id: clientId }).eq("id", camp.id);
          }
        }
      } catch (e) {
        console.warn("[bulk] backfill failed:", (e as Error).message);
      }

      console.log("[bulk] done", stats);
    };

    // @ts-ignore EdgeRuntime is provided by the Supabase Edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(work());
    } else {
      work();
    }

    return new Response(
      JSON.stringify({
        ok: true,
        queued: true,
        accounts_total: accountToClient.size,
        message: "Import läuft im Hintergrund. Prüfe in 2-5 Minuten referenz_meta_campaigns.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

