import {
  billingDiagnose,
  checkAuth,
  corsHeaders,
  jsonResponse,
} from "../_shared/claude-connector.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const unauth = checkAuth(req);
  if (unauth) return unauth;
  try {
    return jsonResponse(await billingDiagnose());
  } catch (e: any) {
    return jsonResponse(
      { success: false, data: null, error: "internal_error", diagnostics: { message: e?.message } },
      500,
    );
  }
});
