// Temporary diagnostic: lead statuses per Close account + checkin activity reachability.
import { closeClient, json, cors } from "../_shared/bonusClose.ts";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const out: any = {};
  for (const name of ["CLOSE_API_KEY", "CLOSE_API_KEY_SALES"]) {
    const k = Deno.env.get(name);
    if (!k) { out[name] = "nicht gesetzt"; continue; }
    const c = closeClient(k);
    const r: any = {};
    try {
      const me = await c(`/me/`); r.org = (me.organizations || []).map((o: any) => o.name);
      const st = await c(`/status/lead/`); r.lead_status = st.data.map((s: any) => ({ id: s.id, label: s.label }));
      const ca = await c(`/custom_activity/`); r.custom_activity = ca.data.map((s: any) => ({ id: s.id, name: s.name }));
      try { const a = await c(`/activity/custom/?user_id=user_cSZy2D3gJjQdHefmwdPY28D1jrgIXvn2G4Fct4vwdQT&custom_activity_type_id=actitype_7JTWiuJtwme5VEukVy6kJ6&date_created__gte=2026-10-01&_limit=5`); r.act_by_user = { n: a.data?.length, sample: (a.data||[]).map((x:any)=>({lead:x.lead_id, at:x.activity_at||x.date_created, u:x.user_id})) }; } catch (e) { r.act_by_user = String(e); }
      try { const a = await c(`/activity/?user_id=user_cSZy2D3gJjQdHefmwdPY28D1jrgIXvn2G4Fct4vwdQT&_type=CustomActivity&date_created__gte=2026-10-01&_limit=5`); r.act_generic = { n: a.data?.length, sample: (a.data||[]).map((x:any)=>({lead:x.lead_id, t:x.custom_activity_type_id})) }; } catch (e) { r.act_generic = String(e); }
      for (const s of r.lead_status) {
        if (!/klient|pausiert/i.test(s.label)) continue;
        const q = await c(`/lead/?query=${encodeURIComponent(`lead_status:"${s.label}"`)}&_limit=1&_fields=id`);
        s.count = q.total_results;
      }
    } catch (e) { r.error = String(e); }
    out[name] = r;
  }
  return json(out);
});
