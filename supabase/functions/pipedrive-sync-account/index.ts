import {
  corsHeaders,
  jsonResponse,
  requireAdmin,
  decryptToken,
  pipedriveFetchAll,
} from "../_shared/pipedrive-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { svc } = auth;

    const { accountId } = await req.json().catch(() => ({}));
    if (!accountId) return jsonResponse({ ok: false, error: "accountId required" }, 400);

    // 1. Load account
    const { data: account, error: accErr } = await svc
      .from("pipedrive_accounts")
      .select("id, domain, api_token_encrypted, name")
      .eq("id", accountId)
      .single();
    if (accErr || !account) {
      return jsonResponse({ ok: false, error: "account_not_found", message: accErr?.message }, 404);
    }

    // 2. Decrypt token
    let apiToken: string;
    try {
      apiToken = await decryptToken(svc, account.api_token_encrypted);
    } catch (e: any) {
      return jsonResponse({ ok: false, error: "decrypt_failed", message: e?.message }, 500);
    }

    const startedAt = Date.now();
    const summary = { pipelines: 0, stages: 0, deals: 0, persons: 0 };

    try {
      // 3. Pipelines
      const pipelines = await pipedriveFetchAll<any>(account.domain, apiToken, "pipelines");
      if (pipelines.length) {
        const rows = pipelines.map((p) => ({
          account_id: account.id,
          pipedrive_id: p.id,
          name: p.name ?? null,
          active: p.active ?? true,
          raw_data: p,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await svc
          .from("pipedrive_pipelines")
          .upsert(rows, { onConflict: "account_id,pipedrive_id" });
        if (error) throw new Error(`pipelines upsert: ${error.message}`);
        summary.pipelines = rows.length;
      }

      // 4. Stages
      const stages = await pipedriveFetchAll<any>(account.domain, apiToken, "stages");
      if (stages.length) {
        const rows = stages.map((s) => ({
          account_id: account.id,
          pipedrive_id: s.id,
          pipeline_id: s.pipeline_id ?? null,
          name: s.name ?? null,
          order_nr: s.order_nr ?? null,
          raw_data: s,
          synced_at: new Date().toISOString(),
        }));
        const { error } = await svc
          .from("pipedrive_stages")
          .upsert(rows, { onConflict: "account_id,pipedrive_id" });
        if (error) throw new Error(`stages upsert: ${error.message}`);
        summary.stages = rows.length;
      }

      // 5. Deals
      const deals = await pipedriveFetchAll<any>(
        account.domain,
        apiToken,
        "deals",
        { status: "all_not_deleted" },
      );
      if (deals.length) {
        const rows = deals.map((d) => ({
          account_id: account.id,
          pipedrive_id: d.id,
          title: d.title ?? null,
          value: d.value ?? null,
          currency: d.currency ?? null,
          stage_id: d.stage_id ?? null,
          stage_name: d.stage_name ?? null,
          status: d.status ?? null,
          person_name: d.person_name ?? d.person_id?.name ?? null,
          org_name: d.org_name ?? d.org_id?.name ?? null,
          expected_close_date: d.expected_close_date ?? null,
          raw_data: d,
          synced_at: new Date().toISOString(),
          pipedrive_updated_at: d.update_time ? new Date(d.update_time).toISOString() : null,
        }));
        // Chunk to avoid massive payloads
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await svc
            .from("pipedrive_deals")
            .upsert(chunk, { onConflict: "account_id,pipedrive_id" });
          if (error) throw new Error(`deals upsert: ${error.message}`);
        }
        summary.deals = rows.length;
      }

      // 6. Persons
      const persons = await pipedriveFetchAll<any>(account.domain, apiToken, "persons");
      if (persons.length) {
        const rows = persons.map((p) => ({
          account_id: account.id,
          pipedrive_id: p.id,
          name: p.name ?? null,
          email: Array.isArray(p.email) ? p.email.map((e: any) => e?.value).filter(Boolean) : null,
          phone: Array.isArray(p.phone) ? p.phone.map((e: any) => e?.value).filter(Boolean) : null,
          org_name: p.org_name ?? p.org_id?.name ?? null,
          raw_data: p,
          synced_at: new Date().toISOString(),
        }));
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await svc
            .from("pipedrive_persons")
            .upsert(chunk, { onConflict: "account_id,pipedrive_id" });
          if (error) throw new Error(`persons upsert: ${error.message}`);
        }
        summary.persons = rows.length;
      }

      // 7. Update account meta
      await svc
        .from("pipedrive_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "success",
          last_sync_message: `${summary.deals} Deals · ${summary.persons} Personen · ${summary.pipelines} Pipelines · ${summary.stages} Stages`,
          total_deals_synced: summary.deals,
          total_persons_synced: summary.persons,
        })
        .eq("id", account.id);

      return jsonResponse({
        ok: true,
        accountId: account.id,
        summary,
        durationMs: Date.now() - startedAt,
      });
    } catch (e: any) {
      await svc
        .from("pipedrive_accounts")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "error",
          last_sync_message: e?.message ?? String(e),
        })
        .eq("id", account.id);
      return jsonResponse({ ok: false, error: "sync_failed", message: e?.message ?? String(e) }, 500);
    }
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: "internal_error", message: e?.message ?? String(e) },
      500,
    );
  }
});
