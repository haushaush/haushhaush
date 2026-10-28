// Täglicher Spend je Anzeigengruppe (Meta Insights, level=adset, time_increment=1) → meta_spend_taeglich.
// Erster Lauf (Tabelle leer): 90 Tage, danach 7 Tage. Konten: alle aus meta_konto_art.
// Auslöser: Admin-JWT oder x-cron-secret (Token in bonus_cron_tokens 'meta_spend_sync').
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireMetaToken } from "../_shared/meta-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v21.0";
const LEAD_TYPES = new Set(["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]);

function leadsAus(actions: any[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  // Höchsten Lead-Typ nehmen statt summieren (Meta meldet dieselben Leads unter mehreren Typen).
  return actions.filter((a) => LEAD_TYPES.has(a.action_type)).reduce((m, a) => Math.max(m, Number(a.value) || 0), 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data } = await admin.from("bonus_cron_tokens").select("token").eq("name", "meta_spend_sync").maybeSingle();
    if (!data?.token || data.token !== cron) return json({ error: "Unauthorized" }, 401);
  } else {
    const auth = req.headers.get("Authorization") || "";
    const { data: u } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: ok } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!ok) return json({ error: "Nur für Admins" }, 403);
  }

  let token: string;
  try { token = await requireMetaToken(); } catch (e) { return json({ error: (e as Error).message }, 500); }

  const until = new Date().toISOString().slice(0, 10);
  const sinceFuer = (tage: number) => new Date(Date.now() - (tage - 1) * 86400000).toISOString().slice(0, 10);
  const norm = (s: unknown) => String(s ?? "").trim().replace(/^act_/, "");

  // Konten: Vereinigung aus meta_konto_art, kunde_meta_accounts (mit Kunde) und werbebudget_zuordnung, ohne act_-Präfix.
  const [ka, kma, wz] = await Promise.all([
    admin.from("meta_konto_art").select("meta_account_id"),
    admin.from("kunde_meta_accounts").select("meta_account_id").not("client_id", "is", null),
    admin.from("werbebudget_zuordnung").select("meta_account_id"),
  ]);
  for (const [n, r] of [["meta_konto_art", ka], ["kunde_meta_accounts", kma], ["werbebudget_zuordnung", wz]] as const)
    if (r.error) return json({ error: `${n}: ${r.error.message}` }, 500);
  const konten = [...new Set([...(ka.data || []), ...(kma.data || []), ...(wz.data || [])].map((r: any) => norm(r.meta_account_id)).filter(Boolean))];

  const ergebnis: { konto: string; zeilen: number; tage?: number; fehler?: string }[] = [];
  for (const id of konten) {
    const act = `act_${id}`;
    try {
      // Erstlauf je Konto: noch keine Zeile (in beiden Schreibweisen) → 90 Tage, sonst 7.
      const { count, error: cErr } = await admin.from("meta_spend_taeglich").select("adset_id", { count: "exact", head: true }).in("meta_account_id", [id, act]);
      if (cErr) throw new Error(cErr.message);
      const tage = (count ?? 0) === 0 ? 90 : 7;
      const since = sinceFuer(tage);
      const rows: any[] = [];
      const p = new URLSearchParams({
        level: "adset", time_increment: "1", limit: "500",
        fields: "campaign_id,campaign_name,adset_id,adset_name,spend,impressions,actions",
        time_range: JSON.stringify({ since, until }), access_token: token,
      });
      let url: string | null = `${GRAPH}/${act}/insights?${p}`;
      let seiten = 0;
      while (url && seiten < 200) {
        const r = await fetch(url);
        const b = await r.json().catch(() => ({}));
        if (!r.ok || b.error) throw new Error(b?.error?.error_user_msg || b?.error?.message || `HTTP ${r.status}`);
        rows.push(...(b.data || []));
        url = b.paging?.next || null; seiten++;
      }
      const jetzt = new Date().toISOString();
      const up = rows.filter((r) => r.adset_id && r.date_start).map((r) => ({
        meta_account_id: id, campaign_id: r.campaign_id ?? null, campaign_name: r.campaign_name ?? null,
        adset_id: String(r.adset_id), adset_name: r.adset_name ?? null, datum: r.date_start,
        spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, leads: leadsAus(r.actions), synced_at: jetzt,
      }));
      for (let i = 0; i < up.length; i += 500) {
        const { error } = await admin.from("meta_spend_taeglich").upsert(up.slice(i, i + 500), { onConflict: "adset_id,datum" });
        if (error) throw new Error(error.message);
      }
      ergebnis.push({ konto: id, zeilen: up.length });
    } catch (e) {
      console.error(`[meta-spend-sync] Konto ${id} fehlgeschlagen:`, (e as Error).message);
      ergebnis.push({ konto: id, zeilen: 0, fehler: (e as Error).message });
    }
  }
  const fehler = ergebnis.filter((e) => e.fehler).length;
  console.log(`[meta-spend-sync] ${since}–${until}: ${ergebnis.length} Konten, ${fehler} Fehler`);
  return json({ since, until, tage, konten: ergebnis.length, fehler, ergebnis });
});
