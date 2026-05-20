import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mem = () => Math.round((Deno.memoryUsage?.().heapUsed ?? 0) / 1024 / 1024);
const truncate = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
  const res = await fetch(`${CLOSE_BASE}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 429) {
    if (attempt > 3) throw new Error("Rate limited after 3 retries");
    await sleep(2000 * Math.pow(2, attempt - 1));
    return closeFetch(path, attempt + 1);
  }
  if (res.status === 401) throw new Error("API key invalid");
  if (res.status === 404) {
    const err: any = new Error("Lead not found");
    err.status = 404;
    throw err;
  }
  if (!res.ok) throw new Error(`Close ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { client_id } = await req.json();
    if (!client_id) throw new Error("client_id required");

    const { data: link, error: linkErr } = await supabase
      .from("close_link")
      .select("close_lead_id")
      .eq("client_id", client_id)
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!link) throw new Error("No close_link for client");
    const leadId: string = link.close_lead_id;
    const sectionErrors: Record<string, string> = {};
    const stats: Record<string, number> = {};

    // 1. LEAD + Custom Fields + inline contacts + inline opportunities
    let lead: any = null;
    try {
      lead = await closeFetch(`/lead/${leadId}/`);
    } catch (e: any) {
      if (e.status === 404) {
        await supabase.from("close_link").delete().eq("client_id", client_id);
        throw new Error("Lead not found in Close — link removed");
      }
      throw e;
    }

    const custom: Record<string, any> = {};
    for (const k of Object.keys(lead)) {
      if (k.startsWith("custom.")) custom[k.slice(7)] = lead[k];
    }
    if (lead.custom && typeof lead.custom === "object") Object.assign(custom, lead.custom);

    const leadRow = {
      id: leadId,
      client_id,
      display_name: lead.display_name || lead.name || null,
      description: truncate(lead.description, 2000),
      url: lead.url || null,
      status_id: lead.status_id || null,
      status_label: lead.status_label || null,
      custom: Object.keys(custom).length ? custom : {},
      custom_fields: Object.keys(custom).length ? custom : null,
      date_created: lead.date_created || null,
      date_updated: lead.date_updated || null,
      synced_at: new Date().toISOString(),
    };
    {
      const { error } = await supabase.from("close_leads").upsert(leadRow, { onConflict: "id" });
      if (error) sectionErrors.lead = error.message;
      else stats.lead = 1;
    }

    // 2. CONTACTS — delete-then-reinsert
    try {
      await supabase.from("close_contacts").delete().eq("close_lead_id", leadId);
      const contacts: any[] = lead.contacts || [];
      if (contacts.length) {
        const rows = contacts.map((c) => ({
          close_contact_id: c.id,
          close_lead_id: leadId,
          client_id,
          name: c.name || null,
          title: c.title || null,
          emails: c.emails || [],
          phones: c.phones || [],
          date_created: c.date_created || null,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("close_contacts").upsert(rows, { onConflict: "close_contact_id" });
        if (error) sectionErrors.contacts = error.message;
      }
      stats.contacts = contacts.length;
    } catch (e: any) {
      sectionErrors.contacts = e.message;
    }

    // 3. OPPORTUNITIES — inline on lead
    try {
      const opps: any[] = lead.opportunities || [];
      if (opps.length) {
        const rows = opps.map((o) => {
          const oCustom: Record<string, any> = {};
          for (const k of Object.keys(o)) if (k.startsWith("custom.")) oCustom[k.slice(7)] = o[k];
          return {
            id: o.id,
            lead_id: leadId,
            client_id,
            lead_name: o.lead_name || null,
            status_type: o.status_type || null,
            status_label: o.status_label || null,
            pipeline_id: o.pipeline_id || null,
            pipeline_name: o.pipeline_name || null,
            value: o.value ?? null,
            value_cents: typeof o.value === "number" ? Math.round(o.value * 100) : null,
            value_formatted: o.value_formatted || null,
            value_currency: o.value_currency || null,
            value_period: o.value_period || null,
            confidence: o.confidence ?? null,
            note: truncate(o.note, 500),
            user_name: o.user_name || null,
            date_won: o.date_won || null,
            date_lost: o.date_lost || null,
            date_created: o.date_created || null,
            date_updated: o.date_updated || null,
            custom_fields: Object.keys(oCustom).length ? oCustom : null,
            synced_at: new Date().toISOString(),
          };
        });
        const { error } = await supabase.from("close_opportunities").upsert(rows, { onConflict: "id" });
        if (error) sectionErrors.opportunities = error.message;
      }
      stats.opportunities = opps.length;
    } catch (e: any) {
      sectionErrors.opportunities = e.message;
    }

    // free lead reference
    lead = null;
    await sleep(300);

    // 4. ACTIVITIES — last 180 days, max 200
    try {
      const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const items: any[] = [];
      for (let skip = 0; skip < 200; skip += 100) {
        const data = await closeFetch(`/activity/?lead_id=${leadId}&date_created__gte=${encodeURIComponent(since)}&_limit=100&_skip=${skip}`);
        const page: any[] = data.data || [];
        items.push(...page);
        if (page.length < 100) break;
        await sleep(300);
      }
      await supabase.from("close_activities").delete().eq("close_lead_id", leadId);
      if (items.length) {
        const rows = items.slice(0, 200).map((a) => {
          const bodyText: string = a.body_text || a.body_preview || a.body_html || a.note || a.text || "";
          return {
            close_activity_id: a.id,
            close_lead_id: leadId,
            client_id,
            activity_type: a._type || a.type || null,
            direction: a.direction || null,
            subject: truncate(a.subject, 500),
            body_preview: truncate(bodyText, 1000),
            duration_seconds: a.duration ?? null,
            user_name: a.user_name || null,
            date_created: a.date_created || null,
            synced_at: new Date().toISOString(),
          };
        });
        const { error } = await supabase.from("close_activities").upsert(rows, { onConflict: "close_activity_id" });
        if (error) sectionErrors.activities = error.message;
      }
      stats.activities = items.length;
      console.log(`[full] activities=${items.length}, mem ${mem()}MB`);
    } catch (e: any) {
      sectionErrors.activities = e.message;
    }

    await sleep(300);

    // 5. TASKS
    try {
      const data = await closeFetch(`/task/?lead_id=${leadId}&_limit=100`);
      const items: any[] = data.data || [];
      await supabase.from("close_tasks").delete().eq("close_lead_id", leadId);
      if (items.length) {
        const rows = items.map((t) => ({
          close_task_id: t.id,
          close_lead_id: leadId,
          client_id,
          text: truncate(t.text, 1000),
          is_complete: !!t.is_complete,
          due_date: t.date || t.due_date || null,
          assigned_to: t.assigned_to_name || t.assigned_to || null,
          date_created: t.date_created || null,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("close_tasks").upsert(rows, { onConflict: "close_task_id" });
        if (error) sectionErrors.tasks = error.message;
      }
      stats.tasks = items.length;
    } catch (e: any) {
      sectionErrors.tasks = e.message;
    }

    await supabase.from("close_link").update({ last_synced_at: new Date().toISOString() }).eq("client_id", client_id);

    const summary = { success: true, client_id, lead_id: leadId, stats, section_errors: sectionErrors, duration_ms: Date.now() - t0, mem_mb: mem() };
    console.log("[sync-close-lead-full]", summary);
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[sync-close-lead-full] fatal:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
