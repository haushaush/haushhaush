// Täglicher Spend je Anzeige (Meta Insights, level=ad, time_increment=1) → meta_ad_spend_taeglich.
// Erster Lauf je Konto: 30 Tage, danach 14 (Meta bucht Conversions bis zu 3 Tage nach). Optional Body { seit: "JJJJ-MM-TT" } für Tieflauf (max. 37 Monate, 90-Tage-Abschnitte).
// Auslöser: Admin-JWT oder x-cron-secret (Token in bonus_cron_tokens 'meta_ad_spend_sync').
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
    const { data } = await admin.from("bonus_cron_tokens").select("token").eq("name", "meta_ad_spend_sync").maybeSingle();
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

  const start = Date.now();
  const DEADLINE_MS = 120_000; // unter dem Laufzeitlimit bleiben; Rest wird als "offen" gemeldet
  const until = new Date().toISOString().slice(0, 10);
  // Optionaler Tieflauf: { "seit": "JJJJ-MM-TT" } gilt für alle Konten; ohne/ungültig → 30/14-Logik (Cron schickt keinen Body).
  let seit: string | null = null;
  try {
    const body = await req.json();
    const v = body?.seit;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v) seit = v;
  } catch { /* kein Body */ }
  let seitBegrenzt = false;
  if (seit) {
    const frueh = new Date(); frueh.setUTCMonth(frueh.getUTCMonth() - 37); frueh.setUTCDate(frueh.getUTCDate() + 1);
    const fruehStr = frueh.toISOString().slice(0, 10);
    if (seit < fruehStr) { seit = fruehStr; seitBegrenzt = true; }
    if (seit > until) seit = until;
  }
  const plusTage = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
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

  const ergebnis: { konto: string; zeilen: number; tage?: number; seit?: string; fehler?: string; unvollstaendig_bis?: string }[] = [];
  const offen: string[] = [];
  for (const id of konten) {
    const act = `act_${id}`;
    if (Date.now() - start > DEADLINE_MS) { offen.push(id); continue; }
    try {
      // Erstlauf je Konto: noch keine Zeile (in beiden Schreibweisen) → 30 Tage, sonst 14.
      let tage: number | undefined;
      let since: string;
      if (seit) since = seit;
      else {
        const { count, error: cErr } = await admin.from("meta_ad_spend_taeglich").select("ad_id", { count: "exact", head: true }).in("meta_account_id", [id, act]);
        if (cErr) throw new Error(cErr.message);
        tage = (count ?? 0) === 0 ? 30 : 14;
        since = sinceFuer(tage);
      }
      // Zeitraum in Abschnitte von höchstens 90 Tagen; nach jedem Abschnitt upserten, damit bei Zeitüberschreitung nichts verloren geht.
      let zeilen = 0;
      let abBis: string | undefined;
      for (let von = since; von <= until; von = plusTage(von, 90)) {
        if (Date.now() - start > DEADLINE_MS) { abBis = von; break; }
        const bis = plusTage(von, 89) < until ? plusTage(von, 89) : until;
      const rows: any[] = [];
      const p = new URLSearchParams({
        level: "ad", time_increment: "1", limit: "500",
        fields: "ad_id,ad_name,adset_id,campaign_id,campaign_name,spend,impressions,clicks,actions",
        time_range: JSON.stringify({ since: von, until: bis }), access_token: token,
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
      const up = rows.filter((r) => r.ad_id && r.date_start).map((r) => ({
        meta_account_id: id, campaign_id: r.campaign_id ?? null, campaign_name: r.campaign_name ?? null,
        adset_id: r.adset_id ? String(r.adset_id) : null, ad_id: String(r.ad_id), ad_name: r.ad_name ?? null, datum: r.date_start,
        spend: Number(r.spend) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, leads: leadsAus(r.actions), synced_at: jetzt,
      }));
      for (let i = 0; i < up.length; i += 500) {
        const { error } = await admin.from("meta_ad_spend_taeglich").upsert(up.slice(i, i + 500), { onConflict: "ad_id,datum" });
        if (error) throw new Error(error.message);
      }
      zeilen += up.length;
      }
      if (abBis) { offen.push(id); ergebnis.push({ konto: id, zeilen, tage, seit: since, unvollstaendig_bis: abBis }); }
      else ergebnis.push({ konto: id, zeilen, tage, seit: since });
    } catch (e) {
      console.error(`[meta-ad-spend-sync] Konto ${id} fehlgeschlagen:`, (e as Error).message);
      ergebnis.push({ konto: id, zeilen: 0, fehler: (e as Error).message });
    }
  }
  const fehler = ergebnis.filter((e) => e.fehler).length;
  const erstlaeufe = ergebnis.filter((e) => e.tage === 30).length;
  console.log(`[meta-ad-spend-sync] bis ${until}: ${ergebnis.length} Konten (${erstlaeufe} Erstläufe 30 Tage), ${fehler} Fehler`);
  const fertig = ergebnis.filter((e) => !e.fehler && !e.unvollstaendig_bis).map((e) => e.konto);
  return json({ until, seit, seit_begrenzt: seitBegrenzt, konten: konten.length, erstlaeufe, fehler, fertig, offen, vollstaendig: offen.length === 0, ergebnis });
});
