import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Qonto integration settings
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "qonto")
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ error: "Qonto not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = settings.api_key || settings.config?.api_key;
    const orgSlug = settings.config?.org_slug;

    if (!apiKey || !orgSlug) {
      return new Response(JSON.stringify({ error: "Missing API key or org slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const qontoAuth = btoa(`${orgSlug}:${apiKey}`);
    const qontoBase = "https://thirdparty.qonto.com/v2";

    // 1. Fetch organization info
    let orgData: any = null;
    try {
      const orgRes = await fetch(`${qontoBase}/organizations/${orgSlug}`, {
        headers: { Authorization: `Basic ${qontoAuth}` },
      });
      if (orgRes.ok) {
        const orgJson = await orgRes.json();
        orgData = orgJson.organization;
      }
    } catch (e) {
      console.error("Org fetch error:", e);
    }

    // 2. Fetch transactions
    let transactions: any[] = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= 10) {
      try {
        const txRes = await fetch(
          `${qontoBase}/transactions?status=completed&current_page=${currentPage}&per_page=100`,
          { headers: { Authorization: `Basic ${qontoAuth}` } }
        );
        if (!txRes.ok) break;
        const txJson = await txRes.json();
        transactions = transactions.concat(txJson.transactions || []);
        hasMore = (txJson.transactions || []).length === 100;
        currentPage++;
      } catch (e) {
        console.error("Tx fetch error:", e);
        hasMore = false;
      }
    }

    // 3. Upsert transactions
    let upsertCount = 0;
    for (const tx of transactions) {
      const row = {
        qonto_id: tx.transaction_id || tx.id,
        amount_cents: tx.amount_cents || Math.round((tx.amount || 0) * 100),
        amount_currency: tx.currency || "EUR",
        direction: tx.side === "debit" ? "debit" : "credit",
        label: tx.label || null,
        reference: tx.reference || null,
        emitted_at: tx.emitted_at || null,
        settled_at: tx.settled_at || null,
        status: tx.status || "completed",
        category: tx.category || null,
        counterparty_name: tx.counterparty_name || tx.label || null,
        attachment_ids: tx.attachment_ids || [],
        raw: tx,
      };

      const { error } = await supabase
        .from("qonto_transactions")
        .upsert(row, { onConflict: "qonto_id" });

      if (!error) upsertCount++;
    }

    // 4. Update integration settings with org info and sync time
    const configUpdate: any = { ...(settings.config || {}) };
    if (orgData) {
      const bankAccount = orgData.bank_accounts?.[0];
      configUpdate.org_name = orgData.legal_name || orgSlug;
      if (bankAccount) {
        configUpdate.iban = bankAccount.iban;
        configUpdate.balance_cents = bankAccount.balance_cents || bankAccount.authorized_balance_cents;
        configUpdate.currency = bankAccount.currency || "EUR";
      }
    }

    await supabase
      .from("integration_settings")
      .update({
        config: configUpdate,
        connected: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
      })
      .eq("id", settings.id);

    return new Response(
      JSON.stringify({
        success: true,
        transactions_synced: upsertCount,
        org: configUpdate.org_name || orgSlug,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-qonto error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
