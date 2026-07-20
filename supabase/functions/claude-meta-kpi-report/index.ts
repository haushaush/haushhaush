import {
  checkAuth,
  corsHeaders,
  fetchKpiReport,
  jsonResponse,
} from "../_shared/claude-connector.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = checkAuth(req);
  if (unauth) return unauth;
  let body: any = {};
  try {
    body = await req.json();
  } catch { /* allow empty body */ }
  try {
    return jsonResponse(await fetchKpiReport(body ?? {}));
  } catch (e: any) {
    return jsonResponse(
      { success: false, data: null, error: "internal_error", diagnostics: { message: e?.message } },
      500,
    );
  }
});
