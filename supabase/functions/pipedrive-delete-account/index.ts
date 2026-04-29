import { corsHeaders, jsonResponse, requireAdmin } from "../_shared/pipedrive-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { svc } = auth;

    const { accountId } = await req.json().catch(() => ({}));
    if (!accountId) return jsonResponse({ ok: false, error: "accountId required" }, 400);

    // Cascade FKs handle deals/persons/pipelines/stages cleanup.
    const { error } = await svc.from("pipedrive_accounts").delete().eq("id", accountId);
    if (error) {
      return jsonResponse({ ok: false, error: "delete_failed", message: error.message }, 500);
    }
    return jsonResponse({ ok: true });
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: "internal_error", message: e?.message ?? String(e) },
      500,
    );
  }
});
