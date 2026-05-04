import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
  if (claimsErr || !claims?.claims) return json({ error: "unauthorized" }, 401);

  const userId = claims.claims.sub as string;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Check admin role
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return json({ error: "forbidden" }, 403);

  const t0 = Date.now();
  const log = (msg: string) => console.log(`[kunden-close-match +${Date.now() - t0}ms] ${msg}`);

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const targetKundeId: string | undefined = body.kundeId;
  const statusFilter: string = body.statusFilter || "won"; // 'won' | 'upsell'

  log(`statusFilter=${statusFilter}, kundeId=${targetKundeId || "all"}`);

  // 1. Load Notion-Kunden
  let kundenQuery = admin
    .from("close_deals")
    .select("id, client_name, vor_nachname, email, telefon, unternehmen");

  if (targetKundeId) {
    kundenQuery = kundenQuery.eq("id", targetKundeId);
  }

  const { data: kunden } = await kundenQuery;
  if (!kunden?.length) return json({ ok: true, matched: 0, message: "No kunden" });

  log(`Loaded ${kunden.length} kunden`);

  // 2. Load Close CRM opportunities filtered by status
  let oppsQuery = admin
    .from("close_opportunities")
    .select("id, lead_id, lead_name, value, value_currency, value_formatted, date_won, status_type, status_label");

  if (statusFilter === "won") {
    oppsQuery = oppsQuery.eq("status_type", "won");
  } else if (statusFilter === "upsell") {
    oppsQuery = oppsQuery.ilike("status_label", "%upsell%");
  } else if (statusFilter === "won_or_upsell") {
    // Combined: won status_type OR upsell in status_label
    oppsQuery = oppsQuery.or("status_type.eq.won,status_label.ilike.%upsell%");
  }

  const { data: filteredOpps } = await oppsQuery;

  if (!filteredOpps?.length) return json({ ok: true, matched: 0, message: `No ${statusFilter} opportunities` });

  log(`Loaded ${filteredOpps.length} ${statusFilter} opportunities`);

  // 3. Load Close leads for contact info
  const leadIds = [...new Set(filteredOpps.map((o) => o.lead_id).filter(Boolean))];
  const { data: closeLeads } = await admin
    .from("close_leads")
    .select("id, display_name, contacts")
    .in("id", leadIds);

  const leadsMap = new Map<string, any>();
  (closeLeads || []).forEach((l) => leadsMap.set(l.id, l));

  // 4. Load existing approved matches and rejections
  let existingQuery = admin
    .from("kunde_close_deals")
    .select("kunde_id, close_opportunity_id, match_type, status_category");
  if (statusFilter !== "won_or_upsell") {
    existingQuery = existingQuery.eq("status_category", statusFilter);
  } else {
    existingQuery = existingQuery.in("status_category", ["won", "upsell"]);
  }
  const { data: existing } = await existingQuery;

  const approvedKeys = new Set(
    (existing || [])
      .filter((r) => r.match_type !== "rejected")
      .map((r) => `${r.kunde_id}|${r.close_opportunity_id}`),
  );
  const rejectedKeys = new Set(
    (existing || [])
      .filter((r) => r.match_type === "rejected")
      .map((r) => `${r.kunde_id}|${r.close_opportunity_id}`),
  );

  // 4b. Load existing pending matches
  let pendingQuery = admin
    .from("pending_close_matches")
    .select("kunde_id, close_lead_id, status_category");
  if (statusFilter !== "won_or_upsell") {
    pendingQuery = pendingQuery.eq("status_category", statusFilter);
  } else {
    pendingQuery = pendingQuery.in("status_category", ["won", "upsell"]);
  }
  const { data: existingPending } = await pendingQuery;
  const pendingKeys = new Set(
    (existingPending || []).map((r) => `${r.kunde_id}|${r.close_lead_id}`),
  );

  // 5. Match
  let autoMatched = 0;
  let pendingCount = 0;
  const directInserts: any[] = [];
  const pendingInserts: any[] = [];

  for (const kunde of kunden) {
    const kundeEmail = (kunde.email || "").toLowerCase().trim();
    const kundeName = (kunde.vor_nachname || kunde.client_name || "").toLowerCase().trim();
    const kundeCompany = (kunde.unternehmen || "").toLowerCase().trim();

    for (const opp of filteredOpps) {
      const key = `${kunde.id}|${opp.id}`;
      if (rejectedKeys.has(key)) continue;
      if (approvedKeys.has(key)) continue;

      const lead = opp.lead_id ? leadsMap.get(opp.lead_id) : null;
      const leadEmails = extractLeadEmails(lead);
      const leadName = (lead?.display_name || opp.lead_name || "").toLowerCase().trim();

      let matchType: string | null = null;
      let confidence = 0;
      let reason = "";

      // Email match
      if (kundeEmail && leadEmails.some((e) => e.toLowerCase() === kundeEmail)) {
        matchType = "auto_email";
        confidence = 1.0;
        reason = `Email: ${kundeEmail}`;
      }

      // Exact name match
      if (!matchType && kundeName && leadName === kundeName) {
        matchType = "auto_name";
        confidence = 0.85;
        reason = `Name exakt: ${kundeName}`;
      }

      // Company match
      if (!matchType && kundeCompany && kundeCompany.length > 3 && leadName.includes(kundeCompany)) {
        matchType = "auto_company";
        confidence = 0.7;
        reason = `Unternehmen: ${kundeCompany} in "${leadName}"`;
      }

      // Fuzzy name
      if (!matchType && kundeName.length > 4) {
        const parts = kundeName.split(/\s+/).filter((p) => p.length > 2);
        if (parts.length >= 2 && parts.every((p) => leadName.includes(p))) {
          matchType = "auto_name";
          confidence = 0.65;
          reason = `Name fuzzy: ${parts.join(" + ")} in "${leadName}"`;
        }
      }

      if (!matchType) continue;

      // High confidence (>=0.95) → direct insert into kunde_close_deals
      if (confidence >= 0.95) {
        directInserts.push({
          kunde_id: kunde.id,
          close_opportunity_id: opp.id,
          close_lead_id: opp.lead_id || "",
          close_lead_name: lead?.display_name || opp.lead_name,
          opportunity_value: opp.value,
          opportunity_currency: opp.value_currency || "EUR",
          date_won: opp.date_won,
          match_type: matchType,
          match_confidence: confidence,
          match_reason: reason,
          close_status_label: opp.status_label || (statusFilter === "won" ? "Won" : "Upsell"),
          status_category: statusFilter,
        });
        log(`AUTO-MATCH [${statusFilter}]: "${kundeName}" ↔ "${leadName}" [${matchType} ${confidence}]`);
        autoMatched++;
      } else {
        // Lower confidence → pending review queue
        const pendingKey = `${kunde.id}|${opp.lead_id || opp.id}`;
        if (!pendingKeys.has(pendingKey)) {
          pendingInserts.push({
            kunde_id: kunde.id,
            close_lead_id: opp.lead_id || opp.id,
            close_lead_name: lead?.display_name || opp.lead_name,
            match_confidence: Math.round(confidence * 100),
            match_reason: reason,
            match_type: matchType,
            status: "pending",
            status_category: statusFilter,
          });
          pendingKeys.add(pendingKey);
          log(`PENDING [${statusFilter}]: "${kundeName}" ↔ "${leadName}" [${matchType} ${confidence}]`);
          pendingCount++;
        }
      }
    }
  }

  // Batch upsert direct matches
  if (directInserts.length > 0) {
    const { error } = await admin
      .from("kunde_close_deals")
      .upsert(directInserts, { onConflict: "kunde_id,close_opportunity_id", ignoreDuplicates: false });
    if (error) {
      log(`Direct upsert error: ${error.message}`);
    }
  }

  // Batch upsert pending matches
  if (pendingInserts.length > 0) {
    const { error } = await admin
      .from("pending_close_matches")
      .upsert(pendingInserts, { onConflict: "kunde_id,close_lead_id", ignoreDuplicates: true });
    if (error) {
      log(`Pending upsert error: ${error.message}`);
    }
  }

  return json({
    ok: true,
    kunden_processed: kunden.length,
    opportunities_checked: filteredOpps.length,
    auto_matched: autoMatched,
    pending: pendingCount,
    duration_ms: Date.now() - t0,
  });
});

function extractLeadEmails(lead: any): string[] {
  if (!lead?.contacts) return [];
  const emails: string[] = [];
  const contacts = Array.isArray(lead.contacts) ? lead.contacts : [];
  for (const c of contacts) {
    const emailList = Array.isArray(c.emails) ? c.emails : [];
    for (const e of emailList) {
      const addr = typeof e === "string" ? e : e?.email;
      if (addr) emails.push(addr);
    }
  }
  return emails;
}
