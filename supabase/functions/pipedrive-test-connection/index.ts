import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.pipedrive\.com.*$/i, "")
    .replace(/\/$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return jsonResponse({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const { apiToken, domain } = body ?? {};
    if (!apiToken || !domain) {
      return jsonResponse({ ok: false, error: "apiToken and domain required" }, 400);
    }

    const dom = cleanDomain(String(domain));
    const url = `https://${dom}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(apiToken)}`;

    const response = await fetch(url);
    let data: any = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || !data?.success) {
      return jsonResponse({
        ok: false,
        error: "auth_failed",
        message: data?.error || "API-Token oder Domain ungültig",
        status: response.status,
      });
    }

    return jsonResponse({
      ok: true,
      user: {
        id: data.data.id,
        name: data.data.name,
        email: data.data.email,
        company_name: data.data.company_name,
        company_domain: data.data.company_domain,
      },
      cleanedDomain: dom,
    });
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: "internal_error", message: e?.message ?? String(e) },
      500,
    );
  }
});
