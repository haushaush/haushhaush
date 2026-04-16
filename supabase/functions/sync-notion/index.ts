import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DB_IDS = {
  kunden:     "2229f181-82a0-8099-a477-d6ff96c0f59e",
  projekte:   "2229f181-82a0-80af-87f2-ccb57a246b2f",
  mitarbeiter:"2229f181-82a0-8068-ab42-000bee953717",
  finanzen:   "2279f181-82a0-8048-a432-000bf0306644",
};

async function fetchAll(key: string, dbId: string): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const url = `https://api.notion.com/v1/databases/${dbId}/query`;
    console.log(`[sync-notion] URL: ${url}`);
    console.log(`[sync-notion] Token prefix: ${key.substring(0, 10)}... DB: ${dbId} cursor: ${cursor || 'none'}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    console.log(`Notion response status: ${res.status} for DB ${dbId}`);
    const data = await res.json();
    if (!res.ok) {
      console.error(`Notion API error detail:`, JSON.stringify(data));
      throw new Error(`Notion ${dbId}: ${data.message}`);
    }
    all.push(...(data.results || []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return all;
}

const gt = (p: any) => p?.title?.[0]?.plain_text || p?.rich_text?.[0]?.plain_text || null;
const gs = (p: any) => p?.select?.name || null;
const gm = (p: any) => (p?.multi_select || []).map((o: any) => o.name);
const gn = (p: any) => p?.number ?? null;
const gd = (p: any) => p?.date?.start || null;
const ge = (p: any) => p?.email || null;
const gp = (p: any) => p?.phone_number || null;
const gu = (p: any) => p?.url || null;
const gc = (p: any) => p?.checkbox ?? false;
const grt = (p: any) => p?.rich_text?.[0]?.plain_text || null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const key = Deno.env.get("NOTION_API_KEY");
    console.log("NOTION_API_KEY set:", !!key, key ? `prefix: ${key.substring(0, 10)}... length: ${key.length}` : "MISSING");
    if (!key) {
      return new Response(
        JSON.stringify({ 
          error: "NOTION_API_KEY not configured", 
          hint: "Go to Supabase Dashboard → Edge Functions → Secrets → Add NOTION_API_KEY" 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const target = body.target || "all";
    const results: Record<string, number> = {};

    // ── KUNDEN ──
    if (target === "all" || target === "kunden") {
      const pages = await fetchAll(key, DB_IDS.kunden);
      const statusMap: Record<string, string> = {
        "In Betreuung": "Aktiv", "Onboarding": "Aktiv",
        "Done": "Churned", "Follow Up": "Pausiert", "Offen": "Pausiert",
      };
      const rows = pages.map((p: any) => {
        const pr = p.properties;
        const kundenstatus = gs(pr["Kundenstatus"]);
        return {
          notion_id: p.id,
          notion_url: p.url,
          client_name: gt(pr["Kunde"]) || grt(pr["Vor- & Nachname"]) || "Unbekannt",
          vor_nachname: grt(pr["Vor- & Nachname"]),
          email: ge(pr["Email"]),
          telefon: gp(pr["Telefon"]),
          website_url: gu(pr["Website URL"]),
          unternehmen: gs(pr["Unternehmen"]),
          status: statusMap[kundenstatus || ""] || "Pausiert",
          kundenstatus,
          ampel: gs(pr["Ampelstatus"]),
          zahlstatus: gs(pr["Zahlstatus"]),
          branche: gm(pr["Branche"]),
          art: gm(pr["Branche"])[0] || null,
          projekttyp: gm(pr["Projekttyp"]),
          leistungen: gm(pr["Projekttyp"]),
          laufzeit: gs(pr["Laufzeit"]) || grt(pr["Laufzeit"]),
          start_datum: gd(pr["Startdatum"]),
          end_datum: gd(pr["Enddatum"]),
          deadline: gd(pr["Deadline"]),
          gesamt_saldo: gn(pr["Gesamt-Saldo"]),
          wert_eur: gn(pr["Gesamt-Saldo"]),
          ads_budget: gn(pr["Ads-Budget"]),
          cash_collect_offen: gn(pr["Cash Collect offen"]),
          clv: gn(pr["CLV (Customer Lifetime Value)"]),
          meta_kosten: gn(pr["Meta Werbeanzeigen Kosten"]),
          crm_kosten: gn(pr["CRM Kosten"]),
          superchat_kosten: gn(pr["Superchat Kosten"]),
          website_kosten: gn(pr["Website Kosten"]),
          laufzeit_in_14t: gc(pr["Laufzeit in 14T fällig"]),
          deal_type: "Neukunde",
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from("close_deals")
        .upsert(rows, { onConflict: "notion_id", ignoreDuplicates: false });
      if (error) throw new Error(`Kunden: ${error.message}`);
      results.kunden = rows.length;
    }

    // ── PROJEKTE ──
    if (target === "all" || target === "projekte") {
      const pages = await fetchAll(key, DB_IDS.projekte);
      const rows = pages.map((p: any) => {
        const pr = p.properties;
        return {
          notion_id: p.id,
          notion_url: p.url,
          name: gt(pr["Projektname"]) || "Unbenannt",
          projektname: gt(pr["Projektname"]) || "Unbenannt",
          status: gs(pr["Projektstatus"]) || "In Bearbeitung",
          projektstatus: gs(pr["Projektstatus"]),
          typ: gm(pr["Typ"]),
          branche: gm(pr["Branche"]),
          prioritaet: gs(pr["Priorität"]),
          laufzeit: gs(pr["Laufzeit"]),
          startdatum: gd(pr["Startdatum"]),
          enddatum: gd(pr["Enddatum"]),
          deadline: gd(pr["Deadline"]),
          zahldatum: gd(pr["Zahldatum"]),
          umsatz_geschr_am: gd(pr["Umsatz geschr. am"]),
          zahlstatus: gs(pr["Zahlstatus"]),
          ads_budget: gn(pr["Ads Budget"]),
          cash_collect: gn(pr["Cash Collect"]),
          offener_cash_collect: gn(pr["Offener Cash Collect"]),
          aktuelle_rate: gn(pr["Aktuelle Rate"]),
          rate_1: gn(pr["1. Rate"]),
          rate_2: gn(pr["2. Rate "]),
          rate_3: gn(pr["3. Rate "]),
          rate_4: gn(pr["4. Rate "]),
          rate_5: gn(pr["5. Rate "]),
          aktueller_monat: grt(pr["Aktueller Monat"]),
          monat_leadanzahl: grt(pr["Monat + Leadanzahl"]),
          cash_collect_uebernommen: gc(pr["Cash Collect übernommen"]),
          mail_gesendet: gc(pr["Mail Gesendet?"]),
          startdatum_abgehakt: gc(pr["startdatum abgehakt?"]),
          verarbeitet: gc(pr["verarbeitet"]),
          deadline_management: gc(pr["Deadline? (Management)"]),
          deadline_mitarbeiter: gc(pr["Deadline? (Mitarbeiter)"]),
          verknuepfte_kunden_ids: (pr["Verknüpfte Kunden"]?.relation || []).map((r: any) => r.id),
          mitarbeiter: (pr["Mitarbeiter"]?.people || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            avatar_url: p.avatar_url || null,
          })),
          verknuepfte_mitarbeiter_ids: (pr["Mitarbeiter"]?.people || []).map((p: any) => p.id),
          verknuepfte_aufgaben_ids: (pr["Verknüpfte Aufgaben"]?.relation || []).map((r: any) => r.id),
          verknuepfte_kunden: (pr["Verknüpfte Kunden"]?.relation || []).map((r: any) => r.id),
          letztes_update: p.last_edited_time || null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from("projects")
        .upsert(rows, { onConflict: "notion_id", ignoreDuplicates: false });
      if (error) throw new Error(`Projekte: ${error.message}`);
      results.projekte = rows.length;
    }

    // ── MITARBEITER ──
    if (target === "all" || target === "mitarbeiter") {
      const pages = await fetchAll(key, DB_IDS.mitarbeiter);
      const rows = pages.map((p: any) => {
        const pr = p.properties;
        return {
          notion_id: p.id,
          notion_url: p.url,
          name: gt(pr["Mitarbeitername"]) || "Unbekannt",
          email: ge(pr["E-Mail-Adresse"]),
          abteilung: gm(pr["Abteilung"]),
          mitarbeiter_typ: gs(pr["Typ"]),
          rolle: gs(pr["Rolle"]),
          mitarbeiter_status: gs(pr["Status"]),
          status: gs(pr["Status"]) || "Aktiv",
          telefonnummer: gp(pr["Telefonnummer"]),
          verfuegbarkeit_h_woche: gn(pr["Verfügbarkeit (h/Woche)"]),
          einstiegsdatum: gd(pr["Einstiegsdatum"]),
          nda_unterschrieben: gc(pr["NDA unterschrieben?"]),
          onboarding_abgeschlossen: gc(pr["Onboarding abgeschlossen?"]),
          zugaenge: gm(pr["Zugänge"]),
          department: gm(pr["Abteilung"])[0] || null,
          updated_at: new Date().toISOString(),
        };
      });
      const { error } = await supabase.from("team")
        .upsert(rows, { onConflict: "notion_id", ignoreDuplicates: false });
      if (error) throw new Error(`Mitarbeiter: ${error.message}`);
      results.mitarbeiter = rows.length;
    }

    // ── FINANZEN ──
    if (target === "all" || target === "finanzen") {
      const pages = await fetchAll(key, DB_IDS.finanzen);
      const rows = pages
        .map((p: any) => {
          const pr = p.properties;
          const netto = gn(pr["Rechnungsbetrag (Netto)"]);
          if (!netto) return null;
          return {
            notion_id: p.id,
            notion_url: p.url,
            rechnungsnummer: pr["Rechnungsnummer"]?.rich_text?.[0]?.plain_text || null,
            leistungsdatum: gd(pr["Startdatum"]),
            faelligkeitsdatum: gd(pr["Zahldatum"]),
            re_gesendet_am: gd(pr["RE gesendet am"]),
            zahldatum: gd(pr["Zahldatum"]),
            netto,
            brutto: Math.round(netto * 1.19 * 100) / 100,
            anteil_vc: gn(pr["Anteil VC"]),
            anteil_hhs: gn(pr["Anteil HHS"]),
            zahlstatus_notion: gs(pr["Zahlstatus"]),
            status: gs(pr["Zahlstatus"]) === "DONE" ? "Bezahlt" :
                    gs(pr["Zahlstatus"]) === "Rechnung versendet" ? "Versendet" : "Entwurf",
            projekt_typ: gs(pr["Typ"]),
            art_des_projekts: gs(pr["Art d. Projekts"]),
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);
      const { error } = await supabase.from("invoices")
        .upsert(rows, { onConflict: "notion_id", ignoreDuplicates: false });
      if (error) throw new Error(`Finanzen: ${error.message}`);
      results.finanzen = rows.length;
    }

    return new Response(
      JSON.stringify({ success: true, synced: results, total: Object.values(results).reduce((a, b) => a + b, 0) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("sync-notion error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
