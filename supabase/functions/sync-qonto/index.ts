import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QONTO_BASE = "https://thirdparty.qonto.com/v2";

function toEur(cents: number | null | undefined): number | null {
  if (cents == null) return null;
  return Math.round(cents) / 100;
}

async function qontoFetch(path: string, login: string, secret: string) {
  const res = await fetch(`${QONTO_BASE}${path}`, {
    headers: {
      Authorization: `${login}:${secret}`,
      Accept: "application/json",
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body?.errors?.[0]?.detail || body?.errors?.[0]?.code || body?.message || `HTTP ${res.status}`;
    throw new Error(`Qonto ${path} failed: ${detail}`);
  }
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Auth: admin only
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: cErr } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (cErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: isAdminData } = await supabase.rpc("has_role", { _user_id: claims.claims.sub, _role: "admin" });
    if (!isAdminData) {
      return new Response(JSON.stringify({ error: "Forbidden – Admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "Auth error" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const login = Deno.env.get("QONTO_LOGIN");
  const secret = Deno.env.get("QONTO_SECRET_KEY");
  if (!login || !secret) {
    return new Response(JSON.stringify({ error: "QONTO_LOGIN / QONTO_SECRET_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const setStatus = async (resource: string, ok: boolean, err?: string) => {
    const patch: any = {
      resource,
      last_synced_at: new Date().toISOString(),
      last_error: ok ? null : (err || "unknown").slice(0, 500),
    };
    if (ok) patch.last_success_at = new Date().toISOString();
    await supabase.from("qonto_sync_status").upsert(patch, { onConflict: "resource" });
  };

  // Mark all resources as "in progress" now so the UI shows immediate feedback.
  const nowIso = new Date().toISOString();
  for (const r of ["organization", "bank_accounts", "transactions", "client_invoices"]) {
    await supabase.from("qonto_sync_status").upsert(
      { resource: r, last_synced_at: nowIso, last_error: null },
      { onConflict: "resource" }
    );
  }

  const runSync = async () => {
    const errors: Record<string, string> = {};
    const synced = { bank_accounts: 0, transactions: 0, invoices: 0 };

  // 1. Organization + Bank Accounts
  let bankAccounts: any[] = [];
  try {
    const org = await qontoFetch("/organization", login, secret);
    bankAccounts = org.organization?.bank_accounts || [];
    for (const acc of bankAccounts) {
      const row = {
        qonto_account_id: acc.id || acc.account_id || null,
        slug: acc.slug || null,
        iban: acc.iban,
        bic: acc.bic || null,
        name: acc.name || null,
        currency: acc.currency || "EUR",
        balance: toEur(acc.balance_cents),
        balance_cents: acc.balance_cents ?? null,
        authorized_balance: toEur(acc.authorized_balance_cents),
        authorized_balance_cents: acc.authorized_balance_cents ?? null,
        status: acc.status || null,
        is_main: !!acc.main,
        raw: acc,
        updated_at: new Date().toISOString(),
      };
      if (row.iban) {
        const { error } = await supabase.from("qonto_bank_accounts").upsert(row, { onConflict: "iban" });
        if (!error) synced.bank_accounts++;
      }
    }
    await setStatus("organization", true);
    await setStatus("bank_accounts", true);
  } catch (e: any) {
    errors.bank_accounts = e.message;
    await setStatus("bank_accounts", false, e.message);
  }

  // 2. Transactions per bank account
  try {
    const { data: statusRow } = await supabase.from("qonto_sync_status").select("last_success_at").eq("resource", "transactions").maybeSingle();
    const since = statusRow?.last_success_at || new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();

    for (const acc of bankAccounts) {
      if (!acc.slug && !acc.id) continue;
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 50) {
        const params = new URLSearchParams({
          slug: acc.slug || "",
          iban: acc.iban || "",
          current_page: String(page),
          per_page: "100",
          status: "completed",
          "updated_at_from": since,
        });
        // Qonto accepts either slug or iban
        let path = `/transactions?${params.toString()}`;
        const body = await qontoFetch(path, login, secret);
        const txs = body.transactions || [];
        for (const tx of txs) {
          const row = {
            transaction_id: tx.transaction_id || tx.id,
            bank_account_iban: acc.iban || null,
            bank_account_id: acc.id || null,
            amount: tx.amount ?? toEur(tx.amount_cents),
            amount_cents: tx.amount_cents ?? (tx.amount != null ? Math.round(tx.amount * 100) : null),
            side: tx.side || null,
            operation_type: tx.operation_type || null,
            currency: tx.currency || "EUR",
            label: tx.label || null,
            reference: tx.reference || null,
            status: tx.status || "completed",
            settled_at: tx.settled_at || null,
            emitted_at: tx.emitted_at || null,
            created_at_qonto: tx.created_at || null,
            updated_at_qonto: tx.updated_at || null,
            category: tx.category || null,
            cashflow_category_name: tx.cashflow_category_name || null,
            raw: tx,
            updated_at: new Date().toISOString(),
          };
          if (row.transaction_id) {
            const { error } = await supabase.from("qonto_transactions_new").upsert(row, { onConflict: "transaction_id" });
            if (!error) synced.transactions++;
          }
        }
        const meta = body.meta || {};
        hasMore = txs.length === 100 && (meta.next_page || page < (meta.total_pages || 0));
        page++;
      }
    }
    await setStatus("transactions", true);
  } catch (e: any) {
    errors.transactions = e.message;
    await setStatus("transactions", false, e.message);
  }

  // 3. Client Invoices
  try {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 50) {
      const params = new URLSearchParams({ current_page: String(page), per_page: "100" });
      const body = await qontoFetch(`/client_invoices?${params.toString()}`, login, secret);
      const invs = body.client_invoices || body.invoices || [];
      for (const inv of invs) {
        const row = {
          qonto_invoice_id: inv.id,
          number: inv.number || null,
          status: inv.status || null,
          invoice_url: inv.invoice_url || inv.url || null,
          contact_email: inv.contact_email || inv.client?.email || null,
          client_name: inv.client?.name || inv.client_name || null,
          client_id: inv.client?.id || inv.client_id || null,
          currency: inv.currency || "EUR",
          total_amount: inv.total_amount?.value != null ? Number(inv.total_amount.value) : (inv.total_amount_cents != null ? toEur(inv.total_amount_cents) : null),
          total_amount_cents: inv.total_amount_cents ?? (inv.total_amount?.value != null ? Math.round(Number(inv.total_amount.value) * 100) : null),
          subtotal_amount: inv.subtotal_amount?.value != null ? Number(inv.subtotal_amount.value) : (inv.subtotal_amount_cents != null ? toEur(inv.subtotal_amount_cents) : null),
          subtotal_amount_cents: inv.subtotal_amount_cents ?? null,
          vat_amount: inv.vat_amount?.value != null ? Number(inv.vat_amount.value) : (inv.vat_amount_cents != null ? toEur(inv.vat_amount_cents) : null),
          vat_amount_cents: inv.vat_amount_cents ?? null,
          issue_date: inv.issue_date || null,
          due_date: inv.due_date || null,
          paid_at: inv.paid_at || inv.payment_date || null,
          created_at_qonto: inv.created_at || null,
          updated_at_qonto: inv.updated_at || null,
          raw: inv,
          updated_at: new Date().toISOString(),
        };
        if (row.qonto_invoice_id) {
          const { error } = await supabase.from("qonto_client_invoices").upsert(row, { onConflict: "qonto_invoice_id" });
          if (!error) synced.invoices++;
        }
      }
      const meta = body.meta || {};
      hasMore = invs.length === 100 && (meta.next_page || page < (meta.total_pages || 0));
      page++;
    }
    await setStatus("client_invoices", true);
  } catch (e: any) {
    errors.client_invoices = e.message;
    await setStatus("client_invoices", false, e.message);
  }

    console.log("sync-qonto finished", { synced, errors });
  };

  // Fire-and-forget: run the actual Qonto sync in the background so we don't
  // hit the 150s edge function timeout for large datasets. The UI polls
  // qonto_sync_status + the data tables to observe progress.
  // @ts-ignore - EdgeRuntime is available in the Supabase edge runtime
  EdgeRuntime.waitUntil(runSync());

  return new Response(
    JSON.stringify({ success: true, started: true, message: "Qonto sync gestartet – läuft im Hintergrund." }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
