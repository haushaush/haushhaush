import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

serve(async (req) => {
  // PREFLIGHT must be checked FIRST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    if (!TOKEN) throw new Error("META_ACCESS_TOKEN not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const accounts: any[] = [];
    let url: string | null =
      `https://graph.facebook.com/v19.0/me/adaccounts` +
      `?fields=id,account_id,name,account_status,business_name,currency` +
      `&limit=100&access_token=${TOKEN}`;

    while (url) {
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        const msg = data.error.message || "Meta API error";
        const status = data.error.code === 190 ? 401 : 500;
        return new Response(
          JSON.stringify({ error: msg }),
          {
            status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          },
        );
      }
      for (const acc of data.data || []) {
        const id: string = acc.id || `act_${acc.account_id}`;
        accounts.push({
          meta_account_id: id,
          name: acc.name || null,
          business_name: acc.business?.name || acc.business_name || null,
          currency: acc.currency || null,
          status: acc.account_status === 1 ? "active" : "inactive",
        });
      }
      url = data.paging?.next || null;
    }

    if (accounts.length > 0) {
      const rows = accounts.map((a) => ({ ...a, last_synced_at: new Date().toISOString() }));
      const { error } = await supabase
        .from("meta_accounts_cache")
        .upsert(rows, { onConflict: "meta_account_id" });
      if (error) console.error("[cache upsert]", error);
    }

    return new Response(
      JSON.stringify({ accounts, cached_at: new Date().toISOString(), count: accounts.length }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (e) {
    console.error("[list-meta-accounts] fatal", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
