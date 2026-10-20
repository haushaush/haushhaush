// Admin-only: setzt das Custom Field „Marke" am verknüpften Close-Lead EINES Kunden (Haush-Haush-Close, kein Fallback).
// Jeder Versuch – erfolgreich oder nicht – landet in close_abschluss_schreiblog. Nach dem Schreiben wird der Lead neu
// aus Close gelesen; nur der Wert, den Close tatsächlich hält, wird in den Spiegel übernommen.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { closeClient, cors, haushKey, json } from "../_shared/bonusClose.ts";

const MARKE_CF = "cf_dEsUZBUAObNZ2yFZZkgSNEefUJWxR2nVJdGq96R9c3W";
const Body = z.object({ client_id: z.string().uuid(), marke: z.enum(["Leadsharks", "Viral Connect"]) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Nicht angemeldet." }, 401);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Nur Admins dürfen die Marke in Close setzen." }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ungültige Eingabe", details: parsed.error.flatten().fieldErrors }, 400);
  const { client_id, marke } = parsed.data;

  const { data: kunde } = await admin.from("clients").select("id, name").eq("id", client_id).is("deleted_at", null).maybeSingle();
  if (!kunde) return json({ error: "Kunde nicht gefunden oder gelöscht." }, 404);
  const { data: link } = await admin.from("close_link").select("close_lead_id").eq("client_id", client_id).limit(1).maybeSingle();
  if (!link?.close_lead_id) return json({ error: "Kunde hat keinen verknüpften Close-Lead." }, 404);
  const leadId = link.close_lead_id;

  const werte: Record<string, unknown> = { feld: MARKE_CF, marke };
  const log = (fehler: string | null) => admin.from("close_abschluss_schreiblog").insert({
    user_id: u.user!.id, user_email: u.user!.email, client_id, kunde: kunde.name, close_lead_id: leadId,
    close_opportunity_id: null, aktion: "marke_setzen", werte, fehler,
  });

  try {
    const call = closeClient(haushKey());
    // Feld und erlaubte Werte live aus Close – nie raten.
    const feld = await call(`/custom_field/lead/${MARKE_CF}/`);
    const wahl = feld?.type === "choices"
      ? (feld.choices || []).find((c: string) => String(c).trim().toLowerCase() === marke.toLowerCase())
      : marke;
    if (!wahl) throw new Error(`Close-Feld „${feld?.name || MARKE_CF}" erlaubt nur ${(feld?.choices || []).join(", ")} – „${marke}" passt nicht.`);
    const vorher = (await call(`/lead/${leadId}/?_fields=custom.${MARKE_CF}`))[`custom.${MARKE_CF}`] ?? null;
    werte.vorher = vorher;
    await call(`/lead/${leadId}/`, "PUT", { [`custom.${MARKE_CF}`]: wahl });
    const jetzt = (await call(`/lead/${leadId}/?_fields=custom.${MARKE_CF}`))[`custom.${MARKE_CF}`] ?? null;
    werte.nachher = jetzt;
    await log(jetzt === wahl ? null : `Close hält nach dem Schreiben „${jetzt ?? "leer"}"`);
    if (jetzt) await admin.from("close_lead_spiegel").update({ marke: jetzt }).eq("close_lead_id", leadId);
    return json({ ok: jetzt === wahl, marke: jetzt, close_lead_id: leadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(msg);
    return json({ error: msg }, 502);
  }
});
