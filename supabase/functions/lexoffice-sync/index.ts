// Read-only mirror of lexoffice (Haush Haush bookkeeping): invoices + customer contacts.
// Never creates or changes anything in lexoffice. Key only from secret LEXOFFICE_API_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = Deno.env.get("LEXOFFICE_API_KEY")?.trim();
    if (!key) return json({ error: "Secret LEXOFFICE_API_KEY fehlt" }, 500);
    const url = Deno.env.get("SUPABASE_URL")!, srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, srk);

    const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (bearer !== srk) {
      const { data: u } = await admin.auth.getUser(bearer);
      if (!u?.user) return json({ error: "Unauthorized" }, 401);
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      if (!isAdmin) return json({ error: "Nur für Admins" }, 403);
    }

    const get = lexClient(key);

    // Rechnungen: Status einzeln; overdue separat (nicht kombinierbar).
    const statusById = new Map<string, any>();
    for (const status of ["open", "paid", "paidoff", "voided", "overdue"]) {
      for (let page = 0; ; page++) {
        const r = await get(`/voucherlist?voucherType=invoice&voucherStatus=${status}&page=${page}&size=250`);
        for (const v of r.content || []) {
          // overdue überschreibt open für dieselbe Rechnung
          statusById.set(v.id, { ...v, _status: status === "overdue" ? "overdue" : (statusById.get(v.id)?._status === "overdue" ? "overdue" : status) });
        }
        if (r.totalPages == null || page + 1 >= r.totalPages || (r.content || []).length === 0) break;
      }
    }
    const rows = [...statusById.values()].map((v) => ({
      voucher_id: v.id,
      number: v.voucherNumber ?? null,
      status: v._status,
      contact_id: v.contactId ?? null,
      contact_name: v.contactName ?? null,
      total_amount: typeof v.totalAmount === "number" ? v.totalAmount : null,
      currency: v.currency ?? null,
      voucher_date: d(v.voucherDate),
      due_date: d(v.dueDate),
      paid_date: d(v.paidDate ?? v.paymentDate),
      raw: v,
      updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("lexoffice_invoices").upsert(rows.slice(i, i + 500), { onConflict: "voucher_id" });
      if (error) throw new Error(error.message);
    }

    // Vollständige Kundenkontaktliste
    const contacts: any[] = [];
    for (let page = 0; ; page++) {
      const r = await get(`/contacts?customer=true&page=${page}&size=250`);
      for (const c of r.content || []) {
        const name = c.company?.name || [c.person?.firstName, c.person?.lastName].filter(Boolean).join(" ") || null;
        const email = c.emailAddresses?.business?.[0] || c.emailAddresses?.office?.[0] || c.emailAddresses?.private?.[0] || c.emailAddresses?.other?.[0] || null;
        contacts.push({ contact_id: c.id, name, email, raw: c, updated_at: new Date().toISOString() });
      }
      if (r.totalPages == null || page + 1 >= r.totalPages || (r.content || []).length === 0) break;
    }
    for (let i = 0; i < contacts.length; i += 500) {
      const { error } = await admin.from("lexoffice_contacts").upsert(contacts.slice(i, i + 500), { onConflict: "contact_id" });
      if (error) throw new Error(error.message);
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
