import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24)); // 32 chars base64url
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data: u } = await admin.auth.getUser(jwt);
  const uid = u?.user?.id;
  if (!uid) return json({ error: "unauthorized" }, 401);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const monat = String(body?.monat || "");
  const mitarbeiter_id = String(body?.mitarbeiter_id || "");
  if (!/^\d{4}-\d{2}-01$/.test(monat)) return json({ error: "monat muss YYYY-MM-01 sein" }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(mitarbeiter_id)) return json({ error: "mitarbeiter_id ungültig" }, 400);

  // Recipient list comes ONLY from the snapshot — no per-client selection possible.
  const { data: snap, error: sErr } = await admin.from("bonus_kunden_snapshot")
    .select("client_id, clients:client_id(name)").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  if (sErr) return json({ error: sErr.message }, 500);

  const { data: existing, error: eErr } = await admin.from("bonus_survey_tokens").select("client_id").eq("monat", monat);
  if (eErr) return json({ error: eErr.message }, 500);
  const have = new Set((existing || []).map((r) => r.client_id));

  const inserts = (snap || []).filter((s) => !have.has(s.client_id))
    .map((s) => ({ token: newToken(), monat, client_id: s.client_id, mitarbeiter_id, kanal: "automatisch" }));
  if (inserts.length) {
    const { error: iErr } = await admin.from("bonus_survey_tokens").upsert(inserts, { onConflict: "monat,client_id", ignoreDuplicates: true });
    if (iErr) return json({ error: iErr.message }, 500);
  }

  const { data: all, error: aErr } = await admin.from("bonus_survey_tokens")
    .select("token, client_id, clients:client_id(name)").eq("monat", monat).eq("mitarbeiter_id", mitarbeiter_id);
  if (aErr) return json({ error: aErr.message }, 500);

  return json({
    created: inserts.length,
    tokens: (all || []).map((t: any) => ({
      client_id: t.client_id, client_name: t.clients?.name ?? null, token: t.token,
      link: `https://leadsharks.de/zufriedenheit?t=${t.token}`,
    })),
  });
});
