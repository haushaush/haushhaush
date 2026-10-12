// Polls the five "Abgang" statuses in the sales pipeline and turns each opportunity into a bonus_churn_events row,
// then leaves a note + task in Close and moves the opportunity to "Ehemaliger Kunde".
// All Close reads happen before any DB write; any Close error aborts the run and is logged.
import { createClient } from "npm:@supabase/supabase-js@2";
import { berlinDate, checkCron, closeForPipeline, cors, json, oppsByStatus, requireManager, resolveClients } from "../_shared/bonusClose.ts";

const ABGANG: Record<string, { typ: string; label: string; churn: boolean; sonderfall?: boolean }> = {
  stat_lw0C84V0kcTzRAyOFc9SNgpCq4l1mJLyea5fFEcW4Hg: { typ: "abbruch", label: "Laufzeit abgebrochen", churn: true },
  stat_PRdhsPNJcgb2ZZ13rFEkaMldqH2gvwQHWnDXnZ32qo1: { typ: "planmaessiges_ende", label: "Laufzeit regulär beendet", churn: false },
  stat_4fldj1q89q9hJnOCwQd7wKyPLkUS9JtVkLw5t8je9Yx: { typ: "kuendigung_arbeitgeber", label: "Vorzeitig entlassen (durch uns)", churn: false },
  stat_9Oxmm9S77UPZgEnwepIlXZr30CP4ncY3OTdzyOEmfZT: { typ: "insolvenz", label: "Insolvenz / Geschäftsaufgabe", churn: false },
  // Sonderfall counts as churn until an admin explicitly recognises it (contract: employer must determine it).
  stat_L1fkxQFOSGFrXGY9DVdB784etCE38HyLZqMVf94ZF8m: { typ: "ausserhalb_verantwortung", label: "Sonderfall (außerhalb Verantwortung)", churn: true, sonderfall: true },
};
const EHEMALIG = "stat_iXYdGcfcx4vdzwxrKHpi65O9mxL77Zby2r45dcIOqc5";
const CF_KUENDIGUNG = "cf_981vqJkEzowJTeNoRnibMiqCdH5ffbMZtnddLU9tN2f";
const CF_LETZTER_TAG = "cf_ZEvtumauW5XdcFJpGq52660WUxRFebOSnmWiOFbH2d2";
const CF_BEGRUENDUNG = "cf_4HaX7c7hvnnwDDXrBSm3ej6bGf70EiqhWPg4LgyHGDK";
const cfv = (o: any, id: string) => { const v = o[`custom.${id}`] ?? o.custom?.[id] ?? null; return v === "" ? null : v; };
const dateOf = (v: any) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const details = (o: any) => {
  const b = cfv(o, CF_BEGRUENDUNG);
  return { kuendigungsdatum: dateOf(cfv(o, CF_KUENDIGUNG)), letzter_vertragstag: dateOf(cfv(o, CF_LETZTER_TAG)), bemerkung: b ? String(b).trim() || null : null };
};

async function run(admin: any) {
  const { call } = await closeForPipeline();
  const opps: any[] = [];
  for (const sid of Object.keys(ABGANG)) opps.push(...await oppsByStatus(call, sid));

  // Fields are usually filled in after the status change: re-read incomplete events of this and last month.
  const now = new Date(); const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const { data: offen, error: oErr } = await admin.from("bonus_churn_events").select("id, close_opportunity_id, close_task_id, close_task_erledigt_am, kuendigungsdatum, bemerkung").not("close_opportunity_id", "is", null).gte("monat", prev).or("kuendigungsdatum.is.null,bemerkung.is.null,close_task_erledigt_am.is.null");
  if (oErr) throw new Error("Lesen fehlgeschlagen: " + oErr.message);
  const nachpruefen: any[] = [];
  const statusIds = new Set(opps.map((o) => o.id));
  for (const e of offen || []) if (!statusIds.has(e.close_opportunity_id)) nachpruefen.push({ ev: e, opp: await call(`/opportunity/${e.close_opportunity_id}/`) });

  const { data: mas } = await admin.from("bonus_mitarbeiter").select("id, close_user_id, team:team_id(name)").eq("aktiv", true);
  const leadIds = [...new Set(opps.map((o) => o.lead_id))];
  const names = new Map(opps.map((o) => [o.lead_id, o.lead_name]));
  const leadToClient = await resolveClients(admin, call, leadIds, names);

  const { data: existing } = await admin.from("bonus_churn_events").select("id, close_opportunity_id, close_note_id, close_task_id").in("close_opportunity_id", opps.map((o) => o.id).length ? opps.map((o) => o.id) : ["-"]);
  const exMap = new Map((existing || []).map((e: any) => [e.close_opportunity_id, e]));

  const nicht_zuordenbar: any[] = [];
  const ergebnisse: any[] = [];
  let neu = 0;
  for (const o of opps) {
    const a = ABGANG[o.status_id];
    const clientId = leadToClient.get(o.lead_id);
    const when = o.date_lost || o.date_updated || o.date_created;
    const datum = berlinDate(when);
    const monat = datum.slice(0, 7) + "-01";
    if (!clientId) { nicht_zuordenbar.push({ close_lead_id: o.lead_id, name: o.lead_name, grund: "Kein Kunde zu diesem Close-Lead gefunden — Status bleibt bis zur Zuordnung stehen" }); continue; }

    // responsible CSM: whoever has the client in the month's snapshot / running list, else close user match, else the only active one
    let maId: string | null = null;
    const { data: s } = await admin.from("bonus_kunden_snapshot").select("mitarbeiter_id").eq("client_id", clientId).eq("monat", monat).limit(1);
    maId = s?.[0]?.mitarbeiter_id ?? null;
    if (!maId) { const { data: k } = await admin.from("bonus_kunden_aktuell").select("mitarbeiter_id").eq("client_id", clientId).limit(1); maId = k?.[0]?.mitarbeiter_id ?? null; }
    if (!maId) maId = (mas || []).find((m: any) => m.close_user_id && m.close_user_id === o.user_id)?.id ?? null;
    if (!maId && (mas || []).length === 1) maId = mas[0].id;
    if (!maId) { nicht_zuordenbar.push({ close_lead_id: o.lead_id, name: o.lead_name, grund: "Kein zuständiger Mitarbeiter ermittelbar" }); continue; }
    const ma = (mas || []).find((m: any) => m.id === maId);

    let ev: any = exMap.get(o.id);
    if (!ev) {
      const { data, error } = await admin.from("bonus_churn_events").insert({
        monat, client_id: clientId, mitarbeiter_id: maId, typ: a.typ, zaehlt_als_churn: a.churn,
        freigabe_status: a.sonderfall ? "offen" : null, close_opportunity_id: o.id, close_lead_id: o.lead_id,
        close_status_id: o.status_id, abgang_datum: datum, ...details(o),
      }).select("id, close_opportunity_id, close_note_id, close_task_id").single();
      if (error) throw new Error("Schreiben fehlgeschlagen: " + error.message);
      ev = data; neu++;
    }
    const heute = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    if (!ev.close_note_id) {
      const n = await call(`/activity/note/`, "POST", { lead_id: o.lead_id, note: `Kundenabgang: ${a.label} — erfasst am ${heute}. Bitte Kündigungsdatum und Begründung ergänzen.` });
      await admin.from("bonus_churn_events").update({ close_note_id: n.id }).eq("id", ev.id);
    }
    if (!ev.close_task_id) {
      const t = await call(`/task/`, "POST", { lead_id: o.lead_id, assigned_to: ma?.close_user_id || o.user_id, text: `Kündigungsdatum und Begründung für ${o.lead_name || "Kunde"} nachtragen`, date: new Date().toISOString().slice(0, 10) });
      await admin.from("bonus_churn_events").update({ close_task_id: t.id }).eq("id", ev.id);
    }
    await call(`/opportunity/${o.id}/`, "PUT", { status_id: EHEMALIG });
    await admin.from("bonus_churn_events").update({ close_status_umgestellt_am: new Date().toISOString() }).eq("id", ev.id);
    nachpruefen.push({ ev: { id: ev.id }, opp: o });
    ergebnisse.push({ kunde: o.lead_name, abgangsart: a.label, monat, zaehlt_als_churn: a.churn, sonderfall: !!a.sonderfall });
  }
  // Update detail fields; close the Close task once Kündigungsdatum and Begründung are present.
  let aktualisiert = 0, tasks_geschlossen = 0;
  const unvollstaendig: any[] = [];
  for (const { ev, opp } of nachpruefen) {
    const d = details(opp);
    const { data: cur, error } = await admin.from("bonus_churn_events").update(d).eq("id", ev.id).select("id, close_task_id, close_task_erledigt_am").single();
    if (error) throw new Error("Aktualisieren fehlgeschlagen: " + error.message);
    aktualisiert++;
    if (d.kuendigungsdatum && d.bemerkung) {
      if (cur.close_task_id && !cur.close_task_erledigt_am) {
        await call(`/task/${cur.close_task_id}/`, "PUT", { is_complete: true });
        await admin.from("bonus_churn_events").update({ close_task_erledigt_am: new Date().toISOString() }).eq("id", ev.id);
        tasks_geschlossen++;
      }
    } else unvollstaendig.push({ kunde: opp.lead_name, fehlt: [!d.kuendigungsdatum && "Kündigungsdatum", !d.bemerkung && "Begründung"].filter(Boolean) });
  }
  return { gefunden: opps.length, neu, nachgeprueft: aktualisiert, tasks_geschlossen, angaben_unvollstaendig: unvollstaendig, verarbeitet: ergebnisse, nicht_zuordenbar };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cron = await checkCron(admin, req, "bonus_churn_sync");
  if (cron === false) return json({ error: "unauthorized" }, 401);
  if (cron === null) { const g = await requireManager(req, admin, createClient); if (!g.ok) return g.res!; }

  const monat = berlinDate(new Date().toISOString()).slice(0, 7) + "-01";
  const { data: log } = await admin.from("bonus_sync_log").insert({ sync_typ: "churn", ausloeser: cron ? "cron" : "manuell", monat }).select("id").single();
  try {
    const r = await run(admin);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: true, gefunden: r.gefunden, neu: r.neu, nicht_zuordenbar: r.nicht_zuordenbar }).eq("id", log.id);
    return json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("bonus-churn-sync failed", msg);
    await admin.from("bonus_sync_log").update({ beendet_am: new Date().toISOString(), ok: false, fehler: msg }).eq("id", log.id);
    return json({ ok: false, error: msg }, 502);
  }
});
