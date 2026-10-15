// Read-only mirror of lexoffice (Haush Haush bookkeeping): invoices + customer contacts.
// Never creates or changes anything in lexoffice. Key only from secret LEXOFFICE_API_KEY.
// Pattern follows sync-qonto: answer immediately, work in background, progress in lexoffice_sync_status,
// run history in lexoffice_sync_runs. Trigger: admin JWT or x-cron-secret (token in bonus_cron_tokens 'lexoffice_sync').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BASE = "https://api.lexoffice.io/v1";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function lexClient(key: string) {
  return async function get(path: string): Promise<any> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
      if (r.status === 429) {
        const wait = Number(r.headers.get("retry-after")) || 2 ** attempt;
        await new Promise((res) => setTimeout(res, Math.min(wait, 30) * 1000));
        continue;
      }
      const t = await r.text();
      if (!r.ok) throw new Error(`lexoffice API ${r.status} bei GET ${path.split("?")[0]}: ${t.slice(0, 300)}`);
      // lexoffice erlaubt ca. 2 Anfragen/Sekunde
      await new Promise((res) => setTimeout(res, 550));
      return t ? JSON.parse(t) : {};
    }
    throw new Error(`lexoffice Rate-Limit bei ${path.split("?")[0]} nach 6 Versuchen`);
  };
}

const d = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);
const now = () => new Date().toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, srk);

  // Auth: cron secret or admin
  let triggerType: "manual" | "auto_cron" = "manual";
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader) {
    const { data } = await admin.from("bonus_cron_tokens").select("token").eq("name", "lexoffice_sync").maybeSingle();
    if (!data?.token || data.token !== cronHeader) return json({ error: "Unauthorized" }, 401);
    triggerType = "auto_cron";
  } else {
    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(bearer);
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Nur für Admins" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const key = Deno.env.get("LEXOFFICE_API_KEY")?.trim();
  // Statusabfrage für die Oberfläche: nur ob das Secret vorhanden ist, kein Lauf.
  if (body?.aktion === "status") return json({ configured: !!key });
  if (!key) return json({ error: "Nicht verbunden — Secret LEXOFFICE_API_KEY fehlt", configured: false }, 500);

  const { data: runRow } = await admin.from("lexoffice_sync_runs").insert({ trigger_type: triggerType, status: "running" }).select("id").single();
  const runId: string | null = runRow?.id ?? null;

  const markStart = (resource: string) => admin.from("lexoffice_sync_status").upsert({
    resource, last_synced_at: now(), started_at: now(), last_error: null, completed: false,
    pages_loaded: 0, fetched_count: 0, total_pages: null, triggered_by: triggerType, updated_at: now(),
  }, { onConflict: "resource" });
  const markProgress = (resource: string, pages_loaded: number, fetched_count: number, total_pages: number | null) =>
    admin.from("lexoffice_sync_status").update({ pages_loaded, fetched_count, total_pages, last_synced_at: now(), updated_at: now() }).eq("resource", resource);
  const markDone = (resource: string, ok: boolean, err: string | null, pages_loaded: number, fetched_count: number, total_pages: number | null) => {
    const patch: any = { last_synced_at: now(), last_error: ok ? null : (err || "unbekannt").slice(0, 500), completed: ok, pages_loaded, fetched_count, total_pages, updated_at: now() };
    if (ok) patch.last_success_at = now();
    return admin.from("lexoffice_sync_status").update(patch).eq("resource", resource);
  };

  await markStart("invoices");
  await markStart("contacts");

  const runSync = async () => {
    const get = lexClient(key);
    const errors: Record<string, string> = {};
    let invCount = 0, conCount = 0;

    // Rechnungen: Status einzeln; overdue separat (nicht kombinierbar).
    let invPages = 0, invTotal = 0;
    try {
      const statusById = new Map<string, any>();
      for (const status of ["open", "paid", "paidoff", "voided", "overdue"]) {
        for (let page = 0; ; page++) {
          const r = await get(`/voucherlist?voucherType=invoice&voucherStatus=${status}&page=${page}&size=250`);
          if (page === 0) invTotal += r.totalPages ?? 1;
          for (const v of r.content || []) {
            statusById.set(v.id, { ...v, _status: status === "overdue" ? "overdue" : (statusById.get(v.id)?._status === "overdue" ? "overdue" : status) });
          }
          invPages++;
          await markProgress("invoices", invPages, statusById.size, invTotal);
          if (r.totalPages == null || page + 1 >= r.totalPages || (r.content || []).length === 0) break;
        }
      }
      const rows = [...statusById.values()].map((v) => ({
        voucher_id: v.id, number: v.voucherNumber ?? null, status: v._status,
        contact_id: v.contactId ?? null, contact_name: v.contactName ?? null,
        total_amount: typeof v.totalAmount === "number" ? v.totalAmount : null, currency: v.currency ?? null,
        voucher_date: d(v.voucherDate), due_date: d(v.dueDate), paid_date: d(v.paidDate ?? v.paymentDate),
        raw: v, updated_at: now(),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("lexoffice_invoices").upsert(rows.slice(i, i + 500), { onConflict: "voucher_id" });
        if (error) throw new Error(error.message);
      }
      invCount = rows.length;
      await markDone("invoices", true, null, invPages, invCount, invTotal);
    } catch (e) {
      errors.invoices = (e as Error).message;
      await markDone("invoices", false, errors.invoices, invPages, invCount, invTotal || null);
    }

    // Vollständige Kundenkontaktliste
    let conPages = 0, conTotal: number | null = null;
    try {
      const contacts: any[] = [];
      for (let page = 0; ; page++) {
        const r = await get(`/contacts?customer=true&page=${page}&size=250`);
        conTotal = r.totalPages ?? conTotal;
        for (const c of r.content || []) {
          const name = c.company?.name || [c.person?.firstName, c.person?.lastName].filter(Boolean).join(" ") || null;
          const email = c.emailAddresses?.business?.[0] || c.emailAddresses?.office?.[0] || c.emailAddresses?.private?.[0] || c.emailAddresses?.other?.[0] || null;
          contacts.push({ contact_id: c.id, name, email, raw: c, updated_at: now() });
        }
        conPages++;
        await markProgress("contacts", conPages, contacts.length, conTotal);
        if (r.totalPages == null || page + 1 >= r.totalPages || (r.content || []).length === 0) break;
      }
      for (let i = 0; i < contacts.length; i += 500) {
        const { error } = await admin.from("lexoffice_contacts").upsert(contacts.slice(i, i + 500), { onConflict: "contact_id" });
        if (error) throw new Error(error.message);
      }
      conCount = contacts.length;
      await markDone("contacts", true, null, conPages, conCount, conTotal);
    } catch (e) {
      errors.contacts = (e as Error).message;
      await markDone("contacts", false, errors.contacts, conPages, conCount, conTotal);
    }

    const failed = Object.keys(errors).length > 0;
    if (runId) {
      await admin.from("lexoffice_sync_runs").update({
        status: failed ? "failed" : "success", finished_at: now(),
        records_invoices: invCount, records_contacts: conCount,
        error_message: failed ? Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join(" | ").slice(0, 1000) : null,
      }).eq("id", runId);
    }
  };

  // @ts-ignore EdgeRuntime exists in the edge runtime
  EdgeRuntime.waitUntil(runSync().catch(async (e) => {
    if (runId) await admin.from("lexoffice_sync_runs").update({ status: "failed", finished_at: now(), error_message: String(e?.message || e).slice(0, 1000) }).eq("id", runId);
  }));
  return json({ started: true });
});
