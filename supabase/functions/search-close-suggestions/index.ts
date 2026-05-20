// Returns top Close-Lead suggestions for a single client (multi-strategy search + scoring).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CLOSE_BASE = "https://api.close.com/api/v1";
const CLOSE_API_KEY = Deno.env.get("CLOSE_API_KEY");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}
const similarity = (a: string, b: string) => {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
};
const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const normPhone = (s: string) => s.replace(/\D/g, "");

async function closeFetch(path: string, attempt = 1): Promise<any> {
  if (!CLOSE_API_KEY) throw new Error("CLOSE_API_KEY missing");
  const auth = btoa(`${CLOSE_API_KEY}:`);
  const res = await fetch(`${CLOSE_BASE}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (res.status === 429) {
    if (attempt > 2) throw new Error("rate_limited");
    await sleep(2000);
    return closeFetch(path, attempt + 1);
  }
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) throw new Error(`close_${res.status}`);
  return res.json();
}

function buildVariants(client: { name?: string | null; email?: string | null; phone?: string | null }): string[] {
  const variants = new Set<string>();
  if (client.email) {
    const e = client.email.trim().toLowerCase();
    variants.add(e);
    if (e.includes(".")) variants.add(e.replace(/\./g, "-"));
    if (e.includes("-")) variants.add(e.replace(/-/g, "."));
    variants.add(e.replace(/[.\-]/g, ""));
  }
  if (client.name) {
    const n = client.name.trim();
    variants.add(n);
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      variants.add([...parts].reverse().join(" "));
      variants.add(parts[parts.length - 1]);
    }
  }
  if (client.phone) {
    const p = normPhone(client.phone);
    if (p.length >= 6) variants.add(p);
  }
  return Array.from(variants).slice(0, 6);
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const my = idx++;
      try { out[my] = await fn(items[my]); }
      catch { out[my] = undefined as any; }
    }
  });
  await Promise.all(workers);
  return out;
}

function scoreLead(lead: any, client: { name?: string | null; email?: string | null; phone?: string | null }) {
  const reasons: string[] = [];
  let confidence = 0;
  const clientEmail = client.email?.trim().toLowerCase() ?? "";
  const clientPhone = client.phone ? normPhone(client.phone) : "";
  const clientName = client.name ? normName(client.name) : "";

  const contacts = lead.contacts || [];
  const emails: string[] = [];
  const phones: string[] = [];
  const contactNames: string[] = [];
  for (const c of contacts) {
    if (c?.name) contactNames.push(c.name);
    for (const e of c?.emails || []) if (e?.email) emails.push(String(e.email).toLowerCase());
    for (const p of c?.phones || []) if (p?.phone) phones.push(normPhone(String(p.phone)));
  }

  if (clientEmail && emails.includes(clientEmail)) { confidence += 1.0; reasons.push("email exact"); }
  else if (clientEmail) {
    const fuzzy = emails.some((e) => similarity(e, clientEmail) >= 0.85);
    if (fuzzy) { confidence += 0.8; reasons.push("email fuzzy"); }
  }
  if (clientPhone && phones.some((p) => p && (p === clientPhone || p.endsWith(clientPhone.slice(-7))))) {
    confidence += 0.5; reasons.push("phone match");
  }
  if (clientName) {
    const dn = lead.display_name ? normName(lead.display_name) : "";
    if (dn && dn === clientName) { confidence += 1.0; reasons.push("display_name exact"); }
    else if (dn) {
      const s = similarity(dn, clientName);
      if (s >= 0.85) { confidence += 0.7; reasons.push("display_name fuzzy"); }
      else if (s >= 0.65) { confidence += 0.4; reasons.push("display_name partial"); }
    }
    if (contactNames.some((n) => normName(n).includes(clientName) || clientName.includes(normName(n)))) {
      confidence += 0.3; reasons.push("contact name substring");
    }
  }
  return {
    confidence: Math.min(1, Number(confidence.toFixed(2))),
    reasons,
    emails: Array.from(new Set(emails)).slice(0, 3),
    phones: Array.from(new Set(phones)).slice(0, 2),
    contact_name: contactNames[0] ?? null,
  };
}

function statusLabel(lead: any): string {
  return lead.status_label || lead.custom?.status || "—";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const client_id: string | undefined = body?.client_id;
    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: client, error } = await supabase
      .from("clients").select("id, name, email, phone").eq("id", client_id).maybeSingle();
    if (error) throw error;
    if (!client) {
      return new Response(JSON.stringify({ error: "client not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const variants = buildVariants(client as any);
    let api_calls_made = 0;

    const resultSets = await runWithConcurrency(variants, 6, async (v) => {
      api_calls_made++;
      const q = encodeURIComponent(`"${v}"`);
      try {
        const data = await Promise.race([
          closeFetch(`/lead/?query=${q}&_limit=3&_fields=id,display_name,contacts,status_label`),
          new Promise<any>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15000)),
        ]);
        return data.data || [];
      } catch (e) {
        console.warn("[suggest] variant fail", v, (e as Error).message);
        return [];
      }
    });

    const seen = new Map<string, any>();
    for (const arr of resultSets) {
      if (!arr) continue;
      for (const l of arr) if (l?.id && !seen.has(l.id)) seen.set(l.id, l);
    }

    const scored = Array.from(seen.values()).map((lead) => {
      const s = scoreLead(lead, client as any);
      return {
        close_lead_id: lead.id,
        display_name: lead.display_name || lead.name || "(ohne Name)",
        contact_name: s.contact_name,
        emails: s.emails,
        phones: s.phones,
        status_label: statusLabel(lead),
        confidence: s.confidence,
        match_reasons: s.reasons,
      };
    }).sort((a, b) => b.confidence - a.confidence).slice(0, 5);

    console.log("[suggest]", {
      client_id, name: (client as any).name,
      suggestions_count: scored.length,
      top_confidence: scored[0]?.confidence ?? 0,
      duration_ms: Date.now() - t0,
    });

    return new Response(JSON.stringify({
      client: { id: client.id, name: (client as any).name, email: (client as any).email },
      suggestions: scored,
      api_calls_made,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("[search-close-suggestions] fatal", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.message === "unauthorized" ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
