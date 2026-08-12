// Provisions-Sync: Qonto-Rechnungen -> Close-Lead -> Custom Activity -> Vertriebler -> sales_provisions
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-provision-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const CLOSE_BASE = "https://api.close.com/api/v1";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Account = { key: string; label: string };

async function closeFetch(acc: Account, path: string, attempt = 1): Promise<any> {
  const url = path.startsWith("http") ? path : `${CLOSE_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${btoa(`${acc.key}:`)}`, Accept: "application/json" },
  });
  if (res.status === 429) {
    if (attempt > 5) throw new Error(`Close rate limited (${acc.label})`);
    await sleep(1000 * attempt);
    return closeFetch(acc, path, attempt + 1);
  }
  if (!res.ok) throw new Error(`Close ${acc.label} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // --- Auth: entweder Cron-Secret (n8n) oder eingeloggter Nutzer mit Berechtigung ---
  const cronSecret = Deno.env.get("PROVISION_SYNC_SECRET");
  const providedSecret = req.headers.get("x-provision-secret");
  let authorized = !!cronSecret && providedSecret === cronSecret;

  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: allowed } = await admin.rpc("user_has_permission", {
      target_user_id: uid,
      requested_permission_key: "sales.provisions.manage",
    });
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
    authorized = !!allowed || !!isAdmin;
    if (!authorized) return json({ error: "forbidden" }, 403);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const days: number = Number.isFinite(body.days) ? Math.max(1, Math.min(1095, body.days)) : 90;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

  const accounts: Account[] = [];
  const salesKey = Deno.env.get("CLOSE_API_KEY_SALES");
  const mainKey = Deno.env.get("CLOSE_API_KEY");
  if (salesKey) accounts.push({ key: salesKey, label: "sales" });
  if (mainKey) accounts.push({ key: mainKey, label: "main" });

  const result = {
    invoices: 0,
    matched_leads: 0,
    matched_reps: 0,
    upserted: 0,
    unassigned: 0,
    errors: [] as string[],
  };

  try {
    const { data: reps } = await admin
      .from("sales_provision_reps")
      .select("id,name,rate,close_user_id,is_active")
      .eq("is_active", true);
    const repList = reps ?? [];
    if (!repList.length) return json({ ...result, message: "Keine aktiven Vertriebler" });

    // Close-User-Verzeichnis je Account (user_id -> Name)
    const userNames = new Map<string, string>();
    for (const acc of accounts) {
      try {
        const me = await closeFetch(acc, "/user/");
        for (const u of me?.data ?? []) {
          const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.display_name || u.email;
          if (u.id && name) userNames.set(u.id, name);
        }
      } catch (e) {
        result.errors.push(`user list ${acc.label}: ${(e as Error).message}`);
      }
    }

    const matchRep = (...candidates: unknown[]) => {
      const names = candidates.map(norm).filter(Boolean);
      return (
        repList.find((r) =>
          names.some((n) => n === norm(r.name) || n.includes(norm(r.name)) || norm(r.name).includes(n)),
        ) ?? null
      );
    };

    const { data: invoices, error: invErr } = await admin
      .from("qonto_client_invoices")
      .select("id,number,client_name,total_amount,status,issue_date,paid_at,raw")
      .gte("issue_date", since)
      .order("issue_date", { ascending: false })
      .limit(1000);
    if (invErr) throw invErr;

    const leadCache = new Map<string, { leadId: string; acc: Account } | null>();

    for (const inv of invoices ?? []) {
      result.invoices++;
      const clientName: string = inv.client_name ?? (inv as any).raw?.client?.name ?? "";
      if (!clientName) continue;

      let lead = leadCache.get(norm(clientName));
      if (lead === undefined) {
        lead = null;
        for (const acc of accounts) {
          try {
            const q = encodeURIComponent(`name:"${clientName.replace(/"/g, "")}"`);
            const res = await closeFetch(acc, `/lead/?query=${q}&_limit=5`);
            const hit =
              (res?.data ?? []).find((l: any) => norm(l.display_name ?? l.name) === norm(clientName)) ??
              (res?.data ?? [])[0];
            if (hit?.id) {
              lead = { leadId: hit.id, acc };
              break;
            }
          } catch (e) {
            result.errors.push(`lead "${clientName}" (${acc.label}): ${(e as Error).message}`);
          }
        }
        leadCache.set(norm(clientName), lead);
      }
      if (lead) result.matched_leads++;

      let rep: any = null;
      let activityId: string | null = null;

      if (lead) {
        try {
          const act = await closeFetch(lead.acc, `/activity/custom/?lead_id=${lead.leadId}&_limit=25`);
          const acts: any[] = act?.data ?? [];
          for (const a of acts) {
            const candidate = matchRep(a.user_name, userNames.get(a.user_id), userNames.get(a.created_by), a.created_by_name);
            if (candidate) {
              rep = candidate;
              activityId = a.id;
              break;
            }
          }
        } catch (e) {
          result.errors.push(`activities ${lead.leadId}: ${(e as Error).message}`);
        }
        if (!rep) {
          // Fallback: Lead-Besitzer
          try {
            const l = await closeFetch(lead.acc, `/lead/${lead.leadId}/`);
            rep = matchRep(userNames.get(l?.created_by), l?.created_by_name);
          } catch (_) {
            /* ignore */
          }
        }
      }

      if (rep) result.matched_reps++;
      else result.unassigned++;

      const amount = Number(inv.total_amount ?? 0);
      const rate = Number(rep?.rate ?? 0.15);
      const paid = inv.status === "paid";

      const row = {
        qonto_invoice_id: inv.id,
        invoice_number: inv.number,
        client_name: clientName,
        amount_net: amount,
        created_date: inv.issue_date,
        invoice_sent_date: inv.issue_date,
        payment_date: paid ? inv.paid_at : null,
        status: paid ? "eingegangen" : "rechnung_gesendet",
        rate,
        commission_amount: Math.round(amount * rate * 100) / 100,
        is_payable: paid,
        rep_id: rep?.id ?? null,
        rep_name: rep?.name ?? null,
        close_lead_id: lead?.leadId ?? null,
        close_activity_id: activityId,
        source: "qonto",
      };

      const { error: upErr } = await admin
        .from("sales_provisions")
        .upsert(row, { onConflict: "qonto_invoice_id" });
      if (upErr) result.errors.push(`upsert ${inv.number}: ${upErr.message}`);
      else result.upserted++;
    }

    return json({ ok: true, ...result, errors: result.errors.slice(0, 20) });
  } catch (e) {
    console.error("sync-sales-provisions failed", e);
    return json({ error: (e as Error).message, ...result }, 500);
  }
});
