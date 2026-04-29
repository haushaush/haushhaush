import {
  corsHeaders,
  jsonResponse,
  pipedriveTestCredentials,
  requireAdmin,
} from "../_shared/pipedrive-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const { apiToken, domain } = body ?? {};
    if (!apiToken || !domain) {
      return jsonResponse({ ok: false, error: "apiToken and domain required" }, 400);
    }

    const result = await pipedriveTestCredentials(String(domain), String(apiToken));
    if (!result.ok) {
      return jsonResponse({
        ok: false,
        error: "auth_failed",
        message: result.data?.error || "API-Token oder Domain ungültig",
        status: result.status,
      });
    }

    const u = result.data.data;
    return jsonResponse({
      ok: true,
      cleanedDomain: result.cleanedDomain,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        company_name: u.company_name,
        company_domain: u.company_domain,
      },
    });
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: "internal_error", message: e?.message ?? String(e) },
      500,
    );
  }
});
