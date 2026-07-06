import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const QONTO_BASE = "https://thirdparty.qonto.com/v2";
const PER_PAGE = 100;
const MAX_PAGES = 500; // hard safety cap = up to 50k rows per resource per run

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

  // Auth: admin JWT OR valid cron secret
  let triggeredBy: "manual" | "cron" = "manual";
  try {
    const cronSecretHeader = req.headers.get("x-cron-secret");
    let cronOk = false;
    if (cronSecretHeader) {
      const envSecret = Deno.env.get("QONTO_CRON_SECRET");
      if (envSecret && cronSecretHeader === envSecret) {
        cronOk = true;
      } else {
        const { data: vOk } = await supabase.rpc("verify_qonto_cron_secret", { p_secret: cronSecretHeader });
        cronOk = !!vOk;
      }
    }
    if (cronOk) {
      triggeredBy = "cron";
    } else {
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
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "Auth error" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Parse body for mode
  let mode: "incremental" | "backfill" = "incremental";
  let backfillSince: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "backfill") {
      mode = "backfill";
      backfillSince = body?.since || "2020-01-01T00:00:00Z";
    }
  } catch { /* ignore */ }

  const login = Deno.env.get("QONTO_LOGIN");
  const secret = Deno.env.get("QONTO_SECRET_KEY");
  if (!login || !secret) {
    return new Response(JSON.stringify({ error: "QONTO_LOGIN / QONTO_SECRET_KEY not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const now = () => new Date().toISOString();

  const markStart = async (resource: string) => {
    await supabase.from("qonto_sync_status").upsert({
      resource,
      last_synced_at: now(),
      started_at: now(),
      last_error: null,
      completed: false,
      pages_loaded: 0,
      fetched_count: 0,
      total_pages: null,
      mode,
      triggered_by: triggeredBy,
    }, { onConflict: "resource" });
  };

  const markProgress = async (resource: string, pages_loaded: number, fetched_count: number, total_pages: number | null) => {
    await supabase.from("qonto_sync_status").update({
      pages_loaded, fetched_count, total_pages, last_synced_at: now(),
    }).eq("resource", resource);
  };

  const markDone = async (resource: string, ok: boolean, err?: string, pages_loaded?: number, fetched_count?: number, total_pages?: number | null) => {
    const patch: any = {
      resource,
      last_synced_at: now(),
      last_error: ok ? null : (err || "unknown").slice(0, 500),
      completed: ok,
    };
    if (ok) patch.last_success_at = now();
    if (pages_loaded != null) patch.pages_loaded = pages_loaded;
    if (fetched_count != null) patch.fetched_count = fetched_count;
    if (total_pages !== undefined) patch.total_pages = total_pages;
    await supabase.from("qonto_sync_status").upsert(patch, { onConflict: "resource" });
  };

  // Immediate status: mark all resources started
  for (const r of ["organization", "bank_accounts", "transactions", "client_invoices"]) {
    await markStart(r);
  }

  const runSync = async () => {
    const errors: Record<string, string> = {};
    const synced = { bank_accounts: 0, transactions: 0, invoices: 0, tx_pages: 0, inv_pages: 0 };

    const syncClientInvoices = async () => {
      let page = 1;
      let hasMore = true;
      let totalPages: number | null = null;
      while (hasMore && page <= MAX_PAGES) {
        const params = new URLSearchParams({
          page: String(page),
          per_page: String(PER_PAGE),
          exclude_imported: "false",
          sort_by: "created_at:desc",
        });
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
            updated_at: now(),
          };
          if (row.qonto_invoice_id) {
            const { error } = await supabase.from("qonto_client_invoices").upsert(row, { onConflict: "qonto_invoice_id" });
            if (!error) synced.invoices++;
          }
        }
        const meta = body.meta || {};
        totalPages = meta.total_pages ?? totalPages;
        const hasNext = meta.next_page != null || (totalPages != null && page < totalPages);
        hasMore = invs.length > 0 && hasNext;
        synced.inv_pages++;
        await markProgress("client_invoices", synced.inv_pages, synced.invoices, totalPages);
        page++;
      }
      await markDone("client_invoices", true, undefined, synced.inv_pages, synced.invoices, totalPages);
    };

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
          updated_at: now(),
        };
        if (row.iban) {
          const { error } = await supabase.from("qonto_bank_accounts").upsert(row, { onConflict: "iban" });
          if (!error) synced.bank_accounts++;
        }
      }
      await markDone("organization", true);
      await markDone("bank_accounts", true, undefined, 1, synced.bank_accounts, 1);
    } catch (e: any) {
      errors.bank_accounts = e.message;
      await markDone("bank_accounts", false, e.message);
    }

    // 2. Client Invoices first — table count/KPIs must be complete even if transaction sync is still running
    try {
      await syncClientInvoices();
    } catch (e: any) {
      errors.client_invoices = e.message;
      await markDone("client_invoices", false, e.message, synced.inv_pages, synced.invoices);
    }

    // 3. Transactions per bank account — full pagination
    try {
      let since: string | null = null;
      if (mode === "backfill") {
        since = backfillSince;
      } else {
        const { data: statusRow } = await supabase.from("qonto_sync_status").select("last_success_at").eq("resource", "transactions").maybeSingle();
        since = statusRow?.last_success_at || new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString();
      }

      let totalPagesAcrossAccounts = 0;
      for (const acc of bankAccounts) {
        if (!acc.slug && !acc.iban) continue;
        let page = 1;
        let hasMore = true;
        let accountTotalPages: number | null = null;
        while (hasMore && page <= MAX_PAGES) {
          const params = new URLSearchParams({
            slug: acc.slug || "",
            iban: acc.iban || "",
            current_page: String(page),
            per_page: String(PER_PAGE),
            status: "completed",
          });
          if (since) params.set("updated_at_from", since);
          const body = await qontoFetch(`/transactions?${params.toString()}`, login, secret);
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
              updated_at: now(),
            };
            if (row.transaction_id) {
              const { error } = await supabase.from("qonto_transactions_new").upsert(row, { onConflict: "transaction_id" });
              if (!error) synced.transactions++;
            }
          }
          const meta = body.meta || {};
          accountTotalPages = meta.total_pages ?? accountTotalPages;
          const hasNext = !!meta.next_page || (accountTotalPages != null && page < accountTotalPages);
          hasMore = txs.length > 0 && hasNext;
          synced.tx_pages++;
          if (synced.tx_pages % 5 === 0) {
            await markProgress("transactions", synced.tx_pages, synced.transactions, totalPagesAcrossAccounts + (accountTotalPages || 0));
          }
          page++;
        }
        totalPagesAcrossAccounts += accountTotalPages || page - 1;
      }
      await markDone("transactions", true, undefined, synced.tx_pages, synced.transactions, totalPagesAcrossAccounts);
    } catch (e: any) {
      errors.transactions = e.message;
      await markDone("transactions", false, e.message, synced.tx_pages, synced.transactions);
    }

    console.log("sync-qonto finished", { mode, synced, errors });
  };

  // @ts-ignore - EdgeRuntime is available in the Supabase edge runtime
  EdgeRuntime.waitUntil(runSync());

  return new Response(
    JSON.stringify({ success: true, started: true, mode, message: `Qonto ${mode} sync gestartet – läuft im Hintergrund.` }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
