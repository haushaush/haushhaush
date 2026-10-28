// Stündliche Prüfung: Kunden mit auto_stopp = true, deren Monatsverbrauch (meta_spend_taeglich seit Monatsersten)
// den Cap (clients.ads_budget) erreicht hat → Eintrag in werbebudget_stopp_log.
// Solange app_settings.werbebudget_auto_stopp_scharf nicht true ist: nur Probelauf, nichts wird pausiert.
// Scharf: zugeordnete Kampagnen/Anzeigengruppen über die Meta-API pausieren, nur wenn alle Vorbedingungen erfüllt sind.
// Auslöser: Admin-JWT oder x-cron-secret (Token in bonus_cron_tokens 'werbebudget_stopp_pruefung').
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireMetaToken } from "../_shared/meta-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const GRAPH = "https://graph.facebook.com/v21.0";
const norm = (s: unknown) => String(s ?? "").replace(/^act_/, "");

type Zuo = { client_id: string; meta_account_id: string; typ: "konto" | "kampagne" | "adset"; objekt_id: string; kampagne_id: string | null; objekt_name: string | null };

async function alle<T>(q: (von: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let von = 0; von < 200000; von += 1000) {
    const { data, error } = await q(von).range(von, von + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data } = await admin.from("bonus_cron_tokens").select("token").eq("name", "werbebudget_stopp_pruefung").maybeSingle();
    if (!data?.token || data.token !== cron) return json({ error: "Unauthorized" }, 401);
  } else {
    const auth = req.headers.get("Authorization") || "";
    const { data: u } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: ok } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!ok) return json({ error: "Nur für Admins" }, 403);
  }

  try {
    const { data: s } = await admin.from("app_settings").select("value").eq("key", "werbebudget_auto_stopp_scharf").maybeSingle();
    const scharf = s?.value === true || s?.value === "true";

    const { data: kunden, error: cErr } = await admin.from("clients")
      .select("id, name, ads_budget, werbebudget_pflicht").eq("auto_stopp", true).is("deleted_at", null);
    if (cErr) throw new Error(cErr.message);
    if (!kunden?.length) return json({ scharf, geprueft: 0, protokolliert: 0 });

    const ids = kunden.map((k) => k.id);
    const d = new Date();
    const monatsErster = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const [zAlle, kma, arten, snap] = await Promise.all([
      alle<Zuo>(() => admin.from("werbebudget_zuordnung").select("client_id, meta_account_id, typ, objekt_id, kampagne_id, objekt_name")),
      alle<{ client_id: string; meta_account_id: string }>(() => admin.from("kunde_meta_accounts").select("client_id, meta_account_id").in("client_id", ids)),
      alle<{ meta_account_id: string; art: string | null }>(() => admin.from("meta_konto_art").select("meta_account_id, art")),
      alle<{ campaign_id: string; account_id: string; status: string | null }>(() => admin.from("meta_campaign_snapshot").select("campaign_id, account_id, status")),
    ]);
    const artJe = new Map(arten.map((a) => [norm(a.meta_account_id), a.art]));

    const kontenJe = new Map<string, Set<string>>();
    for (const r of [...zAlle.filter((z) => ids.includes(z.client_id)), ...kma]) {
      if (!r.client_id || !r.meta_account_id) continue;
      const m = kontenJe.get(r.client_id) || new Set<string>();
      m.add(norm(r.meta_account_id)); kontenJe.set(r.client_id, m);
    }
    const alleKonten = [...new Set([...kontenJe.values()].flatMap((m) => [...m]))];
    const kontoVarianten = alleKonten.flatMap((k) => [k, `act_${k}`]);

    const spend = alleKonten.length ? await alle<{ meta_account_id: string; campaign_id: string | null; adset_id: string; datum: string; spend: number }>(() =>
      admin.from("meta_spend_taeglich").select("meta_account_id, campaign_id, adset_id, datum, spend").gte("datum", monatsErster).in("meta_account_id", kontoVarianten)) : [];

    // Frische je Konto: neuester synced_at
    const frische = new Map<string, string | null>();
    for (const k of alleKonten) {
      const { data } = await admin.from("meta_spend_taeglich").select("synced_at").in("meta_account_id", [k, `act_${k}`]).order("synced_at", { ascending: false }).limit(1).maybeSingle();
      frische.set(k, data?.synced_at ?? null);
    }

    let token: string | null = null;
    const logs: Record<string, unknown>[] = [];
    const jetzt = new Date().toISOString();

    for (const k of kunden) {
      const budget = k.ads_budget != null && Number(k.ads_budget) > 0 ? Number(k.ads_budget) : null;
      const objs = zAlle.filter((z) => z.client_id === k.id);
      const gezaehlt = new Set<string>();
      let verbrauch = 0;
      for (const o of objs) {
        for (const r of spend) {
          const t = o.typ === "adset" ? r.adset_id === o.objekt_id : o.typ === "kampagne" ? r.campaign_id === o.objekt_id : norm(r.meta_account_id) === norm(o.objekt_id || o.meta_account_id);
          if (!t) continue;
          const key = `${r.adset_id}|${r.datum}`;
          if (!gezaehlt.has(key)) { gezaehlt.add(key); verbrauch += Number(r.spend || 0); }
        }
      }
      if (budget == null || verbrauch < budget) continue;

      const konten = [...(kontenJe.get(k.id) || [])];
      const traegerUns = konten.some((a) => artJe.get(a) === "untermarke") || k.werbebudget_pflicht === true;
      // Zu pausierende Objekte: Kampagnen/Adsets direkt; ganzes Konto → alle aktiven Kampagnen dieses Kontos.
      const ziele: { ebene: "kampagne" | "adset"; id: string; name: string | null; konto: string }[] = [];
      for (const o of objs) {
        if (o.typ === "konto") {
          for (const c of snap.filter((c) => c.status === "ACTIVE" && norm(c.account_id) === norm(o.objekt_id || o.meta_account_id)))
            ziele.push({ ebene: "kampagne", id: c.campaign_id, name: null, konto: norm(c.account_id) });
        } else ziele.push({ ebene: o.typ, id: o.objekt_id, name: o.objekt_name, konto: norm(o.meta_account_id) });
      }
      const basis = { client_id: k.id, kunde_name: k.name, geprueft_am: jetzt, monatsbudget: budget, verbrauch: Math.round(verbrauch * 100) / 100 };

      if (!scharf) { logs.push({ ...basis, objekte: ziele, ausgefuehrt: false, grund: "Probelauf" }); continue; }

      // Vorbedingungen
      const gruende: string[] = [];
      if (!traegerUns) gruende.push("Zahler ist nicht „Wir“");
      const objKonten = [...new Set(objs.map((o) => norm(o.meta_account_id)))];
      if (!objKonten.length) gruende.push("keine Objekte zugeordnet");
      for (const a of objKonten) {
        if (!artJe.has(a)) gruende.push(`Konto ${a} nicht in meta_konto_art klassifiziert`);
        const ganz = zAlle.some((z) => z.typ === "konto" && norm(z.objekt_id || z.meta_account_id) === a);
        if (!ganz) {
          const zugeordnet = new Set(zAlle.filter((z) => z.typ === "kampagne").map((z) => z.objekt_id));
          zAlle.filter((z) => z.typ === "adset" && z.kampagne_id).forEach((z) => zugeordnet.add(z.kampagne_id!));
          const offen = snap.filter((c) => c.status === "ACTIVE" && norm(c.account_id) === a && !zugeordnet.has(c.campaign_id));
          if (offen.length) gruende.push(`Konto ${a}: ${offen.length} aktive Kampagnen ohne Kundenzuordnung`);
        }
        const f = frische.get(a);
        if (!f || Date.now() - new Date(f).getTime() > 24 * 3600 * 1000) gruende.push(`Konto ${a}: Spend-Daten älter als 24 Stunden`);
      }
      if (gruende.length) { logs.push({ ...basis, objekte: ziele, ausgefuehrt: false, grund: `Übersprungen: ${gruende.join("; ")}` }); continue; }

      if (!token) token = await requireMetaToken();
      const ergebnisse: Record<string, unknown>[] = [];
      for (const z of ziele) {
        try {
          const r = await fetch(`${GRAPH}/${z.id}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ status: "PAUSED", access_token: token }) });
          const b = await r.json().catch(() => ({}));
          if (!r.ok || b.error) throw new Error(b?.error?.error_user_msg || b?.error?.message || `HTTP ${r.status}`);
          ergebnisse.push({ ...z, pausiert: true });
        } catch (e) { ergebnisse.push({ ...z, pausiert: false, fehler: (e as Error).message }); }
      }
      const fehl = ergebnisse.filter((e) => !e.pausiert);
      logs.push({ ...basis, objekte: ergebnisse, ausgefuehrt: fehl.length < ergebnisse.length, grund: "Cap erreicht",
        fehler: fehl.length ? fehl.map((e) => `${e.id}: ${e.fehler}`).join("; ") : null });
    }

    if (logs.length) {
      const { error } = await admin.from("werbebudget_stopp_log").insert(logs);
      if (error) throw new Error(error.message);
    }
    console.log(`[werbebudget-stopp-pruefung] scharf=${scharf} geprüft=${kunden.length} protokolliert=${logs.length}`);
    return json({ scharf, geprueft: kunden.length, protokolliert: logs.length });
  } catch (e) {
    console.error("[werbebudget-stopp-pruefung] failed:", (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});
