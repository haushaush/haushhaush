// Re-match all referenz_meta_ads against current kunde mappings
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function guessBrancheFromName(name: string): string {
  const lower = (name || "").toLowerCase();
  const map: Array<[string, string]> = [
    ["private kranken", "pkv"], ["pkv", "pkv"], ["krankenversicherung", "pkv"],
    ["berufsunf", "bu"], [" bu ", "bu"],
    ["kfz", "kfz"], ["auto", "kfz"],
    ["rechtsschutz", "rechtsschutz"],
    ["tier", "tierkrankenversicherung"], ["hund", "tierkrankenversicherung"], ["katze", "tierkrankenversicherung"],
    ["wohngeb", "wohngebaeudeversicherung"],
    ["hausrat", "hausratversicherung"],
    ["lebensversicherung", "lebensversicherung"], ["rente", "lebensversicherung"],
    ["photovoltaik", "photovoltaik"], ["solar", "photovoltaik"],
  ];
  for (const [kw, br] of map) if (lower.includes(kw)) return br;
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonError("Nicht authentifiziert", 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonError("Nicht authentifiziert", 401);

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: roles } = await svc.from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) return jsonError("Keine Berechtigung", 403);

    const body = await req.json().catch(() => ({}));
    const overrideManual: boolean = !!body.override_manual;
    const onlyUnmatched: boolean = body.only_unmatched !== false;

    // 1. Build account → kunde lookup via kunde_meta_accounts (link table)
    const { data: links } = await svc
      .from("kunde_meta_accounts")
      .select("meta_account_id, kunde_id");

    const kundeIds = Array.from(new Set((links ?? []).map((l: any) => l.kunde_id)));
    const { data: kunden } = kundeIds.length
      ? await svc
          .from("close_deals")
          .select("id, client_name, branche, unternehmen")
          .in("id", kundeIds)
      : { data: [] as any[] };

    const kundeMap = new Map<string, any>();
    for (const k of (kunden ?? [])) kundeMap.set(k.id, k);

    const accountToKunde = new Map<string, any>();
    for (const l of (links ?? [])) {
      const k = kundeMap.get(l.kunde_id);
      if (!k) continue;
      const id = String(l.meta_account_id);
      const stripped = id.replace(/^act_/, "");
      accountToKunde.set(id, k);
      accountToKunde.set(stripped, k);
      accountToKunde.set(`act_${stripped}`, k);
    }

    // 2. Load ads (skip soft-deleted)
    let q = svc
      .from("referenz_meta_ads")
      .select("id, meta_ad_id, meta_account_id, meta_ad_name, custom_title, linked_kunde_id, filter_values, match_method")
      .is("deleted_at", null);
    if (onlyUnmatched) q = q.is("linked_kunde_id", null);
    const { data: ads } = await q;

    const stats = {
      total: ads?.length ?? 0,
      matched_by_account: 0,
      matched_by_keyword: 0,
      already_correct: 0,
      no_match: 0,
      skipped_manual: 0,
    };

    let updatedCount = 0;
    const nowIso = new Date().toISOString();

    for (const ad of (ads ?? [])) {
      if (!overrideManual && ad.match_method === "manual" && ad.linked_kunde_id) {
        stats.skipped_manual++;
        continue;
      }

      const k = accountToKunde.get(String(ad.meta_account_id));
      if (k) {
        if (ad.linked_kunde_id === k.id) {
          stats.already_correct++;
          continue;
        }
        const fv = { ...(ad.filter_values || {}) } as Record<string, string>;
        if (k.branche && !fv.branche) fv.branche = k.branche;
        if (k.unternehmen && !fv.unternehmen) fv.unternehmen = k.unternehmen;
        const { error } = await svc.from("referenz_meta_ads").update({
          linked_kunde_id: k.id,
          filter_values: fv,
          match_method: "auto_account",
          last_matched_at: nowIso,
        }).eq("id", ad.id);
        if (!error) { stats.matched_by_account++; updatedCount++; }
        continue;
      }

      const guessed = guessBrancheFromName(ad.meta_ad_name || ad.custom_title || "");
      const fv = { ...(ad.filter_values || {}) } as Record<string, string>;
      if (guessed && !fv.branche) {
        fv.branche = guessed;
        const { error } = await svc.from("referenz_meta_ads").update({
          filter_values: fv,
          match_method: "auto_keyword",
          last_matched_at: nowIso,
        }).eq("id", ad.id);
        if (!error) { stats.matched_by_keyword++; updatedCount++; }
        continue;
      }

      // mark as unmatched
      if (ad.match_method !== "unmatched") {
        await svc.from("referenz_meta_ads").update({
          match_method: "unmatched",
          last_matched_at: nowIso,
        }).eq("id", ad.id);
      }
      stats.no_match++;
    }

    return new Response(JSON.stringify({ success: true, stats, updated: updatedCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("rematch-all-ads", e);
    return jsonError(e?.message ?? "Unbekannter Fehler", 500);
  }
});
