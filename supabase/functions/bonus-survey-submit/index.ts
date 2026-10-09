import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://leadsharks.de",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const FIELDS = ["b1_reaktionszeit", "b2_umgang", "b3_verbindlichkeit", "b4_eigeninitiative", "l1_anfragemenge", "l2_anfragequalitaet", "l3_weiterempfehlung"] as const;
const r1 = (n: number) => Math.round(n * 10) / 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let p: any;
  try { p = await req.json(); } catch {
    console.warn("[bonus-survey-submit] rejected: invalid JSON");
    return json({ error: "invalid_json" }, 400);
  }

  const token = typeof p?.token === "string" ? p.token.trim() : "";
  if (!token) {
    console.warn("[bonus-survey-submit] rejected: token missing");
    return json({ error: "token_missing", message: "Kein Token übermittelt." }, 403);
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok, error: tokErr } = await sb.from("bonus_survey_tokens").select("token, ausgefuellt_am").eq("token", token).maybeSingle();
  if (tokErr) {
    console.error("[bonus-survey-submit] token lookup failed", tokErr);
    return json({ error: "server_error" }, 500);
  }
  if (!tok) {
    console.warn(`[bonus-survey-submit] rejected: unknown token ${token.slice(0, 6)}…`);
    return json({ error: "token_invalid", message: "Unbekannter oder ungültiger Token." }, 403);
  }

  const vals: Record<string, number> = {};
  for (const f of FIELDS) {
    const v = p[f];
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      console.warn(`[bonus-survey-submit] rejected token ${token.slice(0, 6)}…: invalid ${f}=${JSON.stringify(v)}`);
      return json({ error: "invalid_value", field: f, message: `${f} muss eine Ganzzahl von 1 bis 5 sein.` }, 400);
    }
    vals[f] = v;
  }
  const kontaktname = typeof p.kontaktname === "string" ? p.kontaktname.trim().slice(0, 200) : "";
  if (!kontaktname) {
    console.warn(`[bonus-survey-submit] rejected token ${token.slice(0, 6)}…: kontaktname missing`);
    return json({ error: "invalid_value", field: "kontaktname", message: "kontaktname fehlt." }, 400);
  }

  // Scores always recomputed server-side; client values are ignored.
  const score_betreuung = r1(((vals.b1_reaktionszeit + vals.b2_umgang + vals.b3_verbindlichkeit + vals.b4_eigeninitiative) - 4) / 16 * 100);
  const score_leistung = r1(((vals.l1_anfragemenge + vals.l2_anfragequalitaet + vals.l3_weiterempfehlung) - 3) / 12 * 100);

  const { error: upErr } = await sb.from("bonus_survey_antworten").upsert({
    token, kontaktname,
    firma: typeof p.firma === "string" && p.firma.trim() ? p.firma.trim().slice(0, 200) : null,
    freitext: typeof p.freitext === "string" && p.freitext.trim() ? p.freitext.trim().slice(0, 5000) : null,
    ...vals, score_betreuung, score_leistung,
  }, { onConflict: "token" });
  if (upErr) {
    console.error("[bonus-survey-submit] upsert failed", upErr);
    return json({ error: "save_failed", message: upErr.message }, 500);
  }

  if (!tok.ausgefuellt_am) {
    const { error: tErr } = await sb.from("bonus_survey_tokens").update({ ausgefuellt_am: new Date().toISOString() }).eq("token", token).is("ausgefuellt_am", null);
    if (tErr) {
      console.error("[bonus-survey-submit] token update failed", tErr);
      return json({ error: "save_failed", message: tErr.message }, 500);
    }
  }
  return json({ ok: true });
});
