// Mirrors clients from the Viral Connect Close account (CLOSE_API_KEY, read-only source)
// into the Haush Haush Close account (CLOSE_API_KEY_SALES, target). New leads are only created
// after explicit admin confirmation (mode "apply"); the hourly cron only mirrors status changes
// and appends new contacts/emails. Never deletes, never overwrites existing target values.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkCron, closeClient, cors, json, requireManager, type Close } from "../_shared/bonusClose.ts";

const AKTIV = "Aktueller Klient", PAUSIERT = "Pausiert", EHEMALIG = "Ehemaliger Klient";
const HH_AKTIV_ID = "stat_QTXREz0rC7CthlaLyMUqbfRUst8okC2wdQYenN55bhd";
const MAX_WRITES = 50;
const LEGAL = /\b(gmbh|mbh|ug|ag|kg|gbr|ohg|ek|e k|eg|se|co|haftungsbeschrankt|inh|inhaber)\b/g;
const normName = (x: string) => (x || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss")
  .replace(/[^a-z0-9]+/g, " ").replace(LEGAL, " ").replace(/\s+/g, " ").trim();
const normPhone = (p: string) => { let d = (p || "").replace(/\D/g, ""); if (d.startsWith("0049")) d = d.slice(4); else if (d.startsWith("49")) d = d.slice(2); return d.replace(/^0+/, ""); };
const normMail = (m: string) => (m || "").trim().toLowerCase();
function dice(a: string, b: string) {
  if (!a || !b) return 0; if (a === b) return 1;
  const bg = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const A = bg(a), B = bg(b); let inter = 0;
  for (const [k, v] of A) inter += Math.min(v, B.get(k) || 0);
  return (2 * inter) / Math.max(1, a.length - 1 + b.length - 1);
}

async function statusMap(call: Close) {
  const st = await call(`/status/lead/`);
  return new Map<string, string>((st.data || []).map((s: any) => [s.label, s.id]));
}
async function allLeads(call: Close, query: string | null, fields: string) {
  const out: any[] = [];
  for (let skip = 0; ; skip += 100) {
    const q = query ? `query=${encodeURIComponent(query)}&` : "";
    const p = await call(`/lead/?${q}_fields=${fields}&_limit=100&_skip=${skip}`);
    out.push(...(p.data || []));
    if (!p.has_more) break;
  }
  return out;
}
const mainContact = (l: any) => (l.contacts || [])[0] || null;
const emailsOf = (l: any) => (l.contacts || []).flatMap((c: any) => (c.emails || []).map((e: any) => normMail(e.email))).filter(Boolean);
const phonesOf = (l: any) => (l.contacts || []).flatMap((c: any) => (c.phones || []).map((p: any) => normPhone(p.phone))).filter((p: string) => p.length >= 6);

async function buildPreview(admin: any, vc: Close, hh: Close) {
  const vcStatus = await statusMap(vc);
  if (!vcStatus.has(AKTIV)) throw new Error(`Status „${AKTIV}" im Viral-Connect-Account nicht gefunden`);
  const [vcLeads, hhLeads, cfs, { data: spiegel }] = await Promise.all([
    allLeads(vc, `lead_status:"${AKTIV}"`, "id,display_name,name,status_label,contacts,custom,date_created"),
    allLeads(hh, null, "id,display_name,status_label,contacts"),
    vc(`/custom_field/lead/?_limit=200`),
    admin.from("close_spiegel").select("*"),
  ]);
  const startCf = (cfs.data || []).find((f: any) => /vertrag/i.test(f.name) && /(start|beginn)/i.test(f.name));
  const byMail = new Map<string, any>(), byName = new Map<string, any[]>(), byPhone = new Map<string, any>();
  for (const l of hhLeads) {
    emailsOf(l).forEach((m: string) => !byMail.has(m) && byMail.set(m, l));
    phonesOf(l).forEach((p: string) => !byPhone.has(p) && byPhone.set(p, l));
    const n = normName(l.display_name); if (n) byName.set(n, [...(byName.get(n) || []), l]);
  }
  const hhNames = hhLeads.map((l) => ({ l, n: normName(l.display_name) }));
  const spMap = new Map((spiegel || []).map((s: any) => [s.vc_lead_id, s]));
  const rows = vcLeads.filter((l) => l.status_label === AKTIV).map((l) => {
    const mc = mainContact(l); const n = normName(l.display_name);
    let hit: any = null, via: string | null = null;
    for (const m of emailsOf(l)) if (byMail.has(m)) { hit = byMail.get(m); via = "email"; break; }
    if (!hit && n && byName.get(n)?.length) { hit = byName.get(n)![0]; via = "name"; }
    if (!hit) for (const p of phonesOf(l)) if (byPhone.has(p)) { hit = byPhone.get(p); via = "telefon"; break; }
    let aehnlich: any = null;
    if (!hit) { let best = 0; for (const h of hhNames) { const s = dice(n, h.n); if (s > best) { best = s; aehnlich = { hh_lead_id: h.l.id, name: h.l.display_name, prozent: Math.round(s * 100) }; } } if (best < 0.6) aehnlich = null; }
    const sp: any = spMap.get(l.id);
    return {
      vc_lead_id: l.id, name: l.display_name, firma: l.name || l.display_name,
      kontakt: mc?.name || null, email: mc?.emails?.[0]?.email || null, status: l.status_label,
      vertragsstart: startCf ? (l[`custom.${startCf.id}`] ?? null) : null,
      einschaetzung: hit ? "existiert" : "neu",
      treffer: hit ? { hh_lead_id: hit.id, name: hit.display_name, via, prozent: Math.round(dice(n, normName(hit.display_name)) * 100), hh_status: hit.status_label } : null,
      aehnlich, spiegel: sp ? { status: sp.status, hh_lead_id: sp.hh_lead_id } : null,
    };
  }).sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  return { rows, vc_gesamt: rows.length, hh_leads_geprueft: hhLeads.length, vertragsstart_feld: startCf?.name || null };
}

async function copyLead(vc: Close, hh: Close, vcId: string, hhCf: Map<string, any>, vcCf: Map<string, any>) {
  const l = await vc(`/lead/${vcId}/`);
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(l)) {
    if (!k.startsWith("custom.") || v == null || v === "") continue;
    const src = vcCf.get(k.slice(7)); if (!src) continue;
    const dst = hhCf.get(`${src.name}|${src.type}`); if (!dst) continue;
    custom[`custom.${dst.id}`] = v;
  }
  const body: any = {
    name: l.display_name || l.name, url: l.url || undefined, description: l.description || undefined, status_id: HH_AKTIV_ID,
    contacts: (l.contacts || []).map((c: any) => ({ name: c.name, title: c.title || undefined,
      emails: (c.emails || []).map((e: any) => ({ email: e.email, type: e.type || "office" })),
      phones: (c.phones || []).map((p: any) => ({ phone: p.phone, type: p.type || "office" })) })),
    addresses: (l.addresses || []).map(({ label, address_1, address_2, city, state, zipcode, country }: any) => ({ label, address_1, address_2, city, state, zipcode, country })),
    ...custom,
  };
  return { created: await hh(`/lead/`, "POST", body), vcLabel: l.status_label };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "close_spiegel_sync");
  if (cron === false) return json({ error: "invalid cron token" }, 401);
  let userId: string | null = null;
  if (!cron) {
    const g = await requireManager(req, admin, createClient); if (!g.ok) return g.res!;
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    userId = (await admin.auth.getUser(jwt)).data.user?.id ?? null;
  }
  const body = await req.json().catch(() => ({}));
  const mode = cron ? "cron" : (body.mode === "preview" ? "preview" : "sync");
  const vcKey = Deno.env.get("CLOSE_API_KEY"), hhKey = Deno.env.get("CLOSE_API_KEY_SALES");
  if (!vcKey || !hhKey) return json({ error: "Close-Zugänge fehlen" }, 500);
  const vc = closeClient(vcKey), hh = closeClient(hhKey);
  const started = new Date().toISOString();
  const log = async (ok: boolean, details: any, fehler: string | null = null, neu = 0, aktualisiert = 0) =>
    admin.from("bonus_sync_log").insert({ sync_typ: "close_spiegel", ausloeser: cron ? "cron" : mode, gestartet_am: started, beendet_am: new Date().toISOString(), ok, neu, aktualisiert, fehler, details });

  try {
    if (mode === "preview") return json(await buildPreview(admin, vc, hh));

    // Automatic run (cron or "Jetzt abgleichen"): first run records the baseline, afterwards every
    // newly appearing "Aktueller Klient" is either linked as duplicate or created in Haush Haush.
    let writes = 0, neu = 0, verknuepft = 0, altbestand = 0; const uebernahmen: any[] = [], fehler: any[] = []; let abgebrochen = false;
    const { count: baseCount } = await admin.from("close_spiegel").select("id", { count: "exact", head: true });
    if (!baseCount) {
      const base = (await allLeads(vc, `lead_status:"${AKTIV}"`, "id,display_name,status_label")).filter((l) => l.status_label === AKTIV);
      const now = new Date().toISOString();
      const recs = base.map((l) => ({ vc_lead_id: l.id, vc_lead_name: l.display_name, status: "altbestand", vc_status_label: AKTIV, letzter_abgleich: now }));
      for (let i = 0; i < recs.length; i += 200) {
        const { error } = await admin.from("close_spiegel").upsert(recs.slice(i, i + 200), { onConflict: "vc_lead_id", ignoreDuplicates: true });
        if (error) throw new Error(`Ausgangsbestand konnte nicht gespeichert werden: ${error.message}`);
      }
      altbestand = recs.length;
    } else {
      const pv = await buildPreview(admin, vc, hh);
      const todo = pv.rows.filter((r: any) => !r.spiegel);
      let hhCf: Map<string, any> | null = null, vcCf: Map<string, any> | null = null;
      for (const r of todo) {
        const { data: ex } = await admin.from("close_spiegel").select("id").eq("vc_lead_id", r.vc_lead_id).maybeSingle();
        if (ex) continue;
        const now = new Date().toISOString();
        if (r.treffer) {
          const { error } = await admin.from("close_spiegel").insert({ vc_lead_id: r.vc_lead_id, vc_lead_name: r.name, hh_lead_id: r.treffer.hh_lead_id, status: "dublette_verknuepft",
            treffer_via: r.treffer.via, vc_status_label: r.status, uebernommen_am: now, letzter_abgleich: now });
          if (error) fehler.push({ vc_lead_id: r.vc_lead_id, fehler: error.message }); else { verknuepft++; uebernahmen.push({ name: r.name, dublette: r.treffer.name, via: r.treffer.via }); }
          continue;
        }
        if (writes + 2 > MAX_WRITES) { abgebrochen = true; break; }
        try {
          if (!hhCf) {
            const [h, v] = await Promise.all([hh(`/custom_field/lead/?_limit=200`), vc(`/custom_field/lead/?_limit=200`)]);
            hhCf = new Map((h.data || []).map((f: any) => [`${f.name}|${f.type}`, f])); vcCf = new Map((v.data || []).map((f: any) => [f.id, f]));
          }
          const { created, vcLabel } = await copyLead(vc, hh, r.vc_lead_id, hhCf, vcCf!); writes++;
          const { error } = await admin.from("close_spiegel").insert({ vc_lead_id: r.vc_lead_id, vc_lead_name: created.display_name, hh_lead_id: created.id, status: "gespiegelt",
            vc_status_label: vcLabel, uebernommen_am: now, uebernommen_von: userId, letzter_abgleich: now });
          if (error) throw new Error(`Spiegel-Eintrag fehlgeschlagen (Lead ${created.id} angelegt): ${error.message}`);
          neu++; uebernahmen.push({ name: created.display_name, hh_lead_id: created.id });
          const datum = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" }).format(new Date());
          await hh(`/activity/note/`, "POST", { lead_id: created.id, note: `Aus Viral Connect übernommen am ${datum}, Quell-Lead ${r.vc_lead_id}.` }); writes++;
        } catch (e) { fehler.push({ vc_lead_id: r.vc_lead_id, name: r.name, fehler: String((e as Error).message || e) }); }
      }
    }

    // cron / "sync": mirror status + append contact data, count pending
    const [hhStatus, { data: rows }] = await Promise.all([statusMap(hh), admin.from("close_spiegel").select("*").eq("status", "gespiegelt")]);
    let aktualisiert = 0; const aenderungen: any[] = [];
    for (const r of rows || []) {
      if (!r.hh_lead_id) continue;
      if (writes >= MAX_WRITES) { abgebrochen = true; break; }
      try {
        const [src, dst] = await Promise.all([vc(`/lead/${r.vc_lead_id}/?_fields=id,status_label,contacts`), hh(`/lead/${r.hh_lead_id}/?_fields=id,status_label,contacts`)]);
        if ((src.status_label === EHEMALIG || src.status_label === PAUSIERT) && dst.status_label !== src.status_label && hhStatus.get(src.status_label)) {
          await hh(`/lead/${r.hh_lead_id}/`, "PUT", { status_id: hhStatus.get(src.status_label) }); writes++;
          aenderungen.push({ hh_lead_id: r.hh_lead_id, status: src.status_label });
        }
        const dstMails = new Set(emailsOf(dst)), dstNames = new Map((dst.contacts || []).map((c: any) => [normName(c.name || ""), c]));
        for (const c of src.contacts || []) {
          if (writes >= MAX_WRITES) { abgebrochen = true; break; }
          const newMails = (c.emails || []).filter((e: any) => !dstMails.has(normMail(e.email)));
          const match: any = dstNames.get(normName(c.name || ""));
          if (match && newMails.length) {
            await hh(`/contact/${match.id}/`, "PUT", { emails: [...(match.emails || []), ...newMails.map((e: any) => ({ email: e.email, type: e.type || "office" }))] }); writes++;
            aenderungen.push({ hh_lead_id: r.hh_lead_id, kontakt: c.name, neue_emails: newMails.length });
          } else if (!match && (newMails.length || !(c.emails || []).length)) {
            await hh(`/contact/`, "POST", { lead_id: r.hh_lead_id, name: c.name, title: c.title || undefined,
              emails: (c.emails || []).map((e: any) => ({ email: e.email, type: e.type || "office" })), phones: (c.phones || []).map((p: any) => ({ phone: p.phone, type: p.type || "office" })) }); writes++;
            aenderungen.push({ hh_lead_id: r.hh_lead_id, neuer_kontakt: c.name });
          }
        }
        await admin.from("close_spiegel").update({ vc_status_label: src.status_label, letzter_abgleich: new Date().toISOString() }).eq("id", r.id);
        aktualisiert++;
      } catch (e) { fehler.push({ vc_lead_id: r.vc_lead_id, fehler: String((e as Error).message || e) }); }
    }
    const ergebnis = { modus: "sync", altbestand, neu_angelegt: neu, dubletten_verknuepft: verknuepft, uebernahmen, aenderungen, fehler, abgebrochen, schreibvorgaenge: writes, hinweis: abgebrochen ? `Limit von ${MAX_WRITES} Schreibvorgängen erreicht` : null };
    await log(fehler.length === 0, ergebnis, fehler.length ? `${fehler.length} Fehler` : null, neu, aktualisiert);
    return json({ ok: true, ...ergebnis });
  } catch (e) {
    const msg = String((e as Error).message || e);
    if (mode !== "preview") await log(false, { modus: mode }, msg);
    return json({ error: msg }, 500);
  }
});
