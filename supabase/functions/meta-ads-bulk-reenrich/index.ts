// Bulk re-run auto-enrichment over every imported Meta Ad in referenz_meta_ads.
// Admin-only. Does not touch creative URLs or metrics — only filter_values,
// custom_tags, and linked_kunde_id derived from the linked Kunde.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enrichAdData } from "../_shared/showcase-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ads, error: fetchErr } = await svc
      .from("referenz_meta_ads")
      .select("id, meta_account_id, meta_account_name, filter_values, custom_tags");
    if (fetchErr) throw fetchErr;

    let enriched = 0;
    let linked = 0;
    const errors: { id: string; error: string }[] = [];

    for (const ad of (ads ?? []) as any[]) {
      try {
        const result = await enrichAdData(
          svc,
          { meta_account_id: ad.meta_account_id, meta_account_name: ad.meta_account_name },
          ad.filter_values ?? {},
          ad.custom_tags ?? [],
        );

        const { error: updErr } = await svc
          .from("referenz_meta_ads")
          .update({
            filter_values: result.filter_values,
            custom_tags: result.custom_tags,
            linked_kunde_id: result.linked_kunde_id,
          })
          .eq("id", ad.id);

        if (updErr) {
          errors.push({ id: ad.id, error: updErr.message });
        } else {
          enriched++;
          if (result.linked_kunde_id) linked++;
        }
      } catch (e) {
        errors.push({ id: ad.id, error: (e as Error).message });
      }
    }

    return new Response(JSON.stringify({ enriched, linked, total: ads?.length ?? 0, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("meta-ads-bulk-reenrich", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
