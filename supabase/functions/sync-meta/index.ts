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

    // Validate user JWT
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

    // Get Meta integration settings
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "meta_ads")
      .maybeSingle();

    if (!settings) {
      return new Response(JSON.stringify({ error: "Meta Ads not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = settings.config?.access_token || settings.access_token;
    const accountMappings: Record<string, string> = settings.config?.account_mappings || {};

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing Meta access token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse optional body
    let datePreset = "last_30d";
    try {
      const body = await req.json();
      if (body?.date_preset) datePreset = body.date_preset;
    } catch { /* no body */ }

    // Collect ad account IDs from account_mappings values
    const adAccountIds = Object.keys(accountMappings).filter(Boolean);

    if (adAccountIds.length === 0) {
      return new Response(JSON.stringify({ error: "No ad accounts mapped. Map accounts in Einstellungen → Integrationen → Meta Ads." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSynced = 0;
    const syncedAccounts: string[] = [];

    for (const accountId of adAccountIds) {
      // Ensure account ID has act_ prefix
      const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;

      try {
        const url = `https://graph.facebook.com/v19.0/${actId}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,actions,ctr,cpm,reach&date_preset=${datePreset}&level=campaign&time_increment=1&limit=500&access_token=${accessToken}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.error) {
          console.error(`Meta API error for ${actId}:`, data.error.message);
          continue;
        }

        const rows = data.data || [];

        // Get account name
        let accountName = actId;
        try {
          const nameRes = await fetch(`https://graph.facebook.com/v19.0/${actId}?fields=name&access_token=${accessToken}`);
          const nameData = await nameRes.json();
          if (nameData.name) accountName = nameData.name;
        } catch { /* keep actId */ }

        for (const row of rows) {
          // Extract leads from actions array
          let leads = 0;
          if (row.actions && Array.isArray(row.actions)) {
            const leadAction = row.actions.find((a: any) => a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_lead");
            if (leadAction) leads = parseInt(leadAction.value) || 0;
          }

          const spend = parseFloat(row.spend || "0");
          const cpl = leads > 0 ? spend / leads : 0;

          const upsertRow = {
            ad_account_id: actId,
            ad_account_name: accountName,
            campaign_id: row.campaign_id || null,
            campaign_name: row.campaign_name || null,
            date_start: row.date_start,
            date_stop: row.date_stop || row.date_start,
            spend,
            impressions: parseInt(row.impressions || "0"),
            clicks: parseInt(row.clicks || "0"),
            leads,
            cpl: Math.round(cpl * 100) / 100,
            ctr: parseFloat(row.ctr || "0"),
            cpm: parseFloat(row.cpm || "0"),
            reach: parseInt(row.reach || "0"),
            synced_at: new Date().toISOString(),
          };

          const { error } = await supabase
            .from("meta_insights")
            .upsert(upsertRow, { onConflict: "ad_account_id,campaign_id,date_start" });

          if (!error) totalSynced++;
        }

        syncedAccounts.push(accountName);
      } catch (e) {
        console.error(`Error syncing ${actId}:`, e);
      }
    }

    // Update integration settings with sync info
    await supabase
      .from("integration_settings")
      .update({
        connected: true,
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_sync_error: null,
      })
      .eq("id", settings.id);

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        accounts: syncedAccounts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-meta error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
