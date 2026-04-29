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
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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
    const { apiToken, domain, syncIntervalMinutes } = body ?? {};
    if (!apiToken || !domain) {
      return jsonResponse({ ok: false, error: "apiToken and domain required" }, 400);
    }

    const dom = cleanDomain(String(domain));

    // Step 1: validate against Pipedrive
    const testUrl = `https://${dom}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(apiToken)}`;
    const testRes = await fetch(testUrl);
    const testData = await testRes.json().catch(() => null);
    if (!testRes.ok || !testData?.success) {
      return jsonResponse({
        ok: false,
        error: "auth_failed",
        message: testData?.error || "Verbindung zu Pipedrive fehlgeschlagen",
      });
    }

    // Step 2: encrypt API token using existing helper (reuses IMAP encryption key)
    const encryptionKey = Deno.env.get("IMAP_ENCRYPTION_KEY") ?? "";
    if (!encryptionKey) {
      return jsonResponse(
        { ok: false, error: "missing_secret", message: "IMAP_ENCRYPTION_KEY nicht konfiguriert" },
        500,
      );
    }
    const { data: encrypted, error: encErr } = await svc.rpc("encrypt_imap_password", {
      password: apiToken,
      encryption_key: encryptionKey,
    });
    if (encErr) {
      return jsonResponse({ ok: false, error: "encrypt_failed", message: encErr.message }, 500);
    }

    // Step 3: deactivate any existing active rows, then upsert
    await svc
      .from("pipedrive_settings")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("is_active", true);

    const { data: inserted, error: insErr } = await svc
      .from("pipedrive_settings")
      .insert({
        api_token_encrypted: encrypted as string,
        domain: dom,
        sync_interval_minutes: Number(syncIntervalMinutes) || 15,
        is_active: true,
        created_by: user.id,
        last_sync_status: "connected",
        last_sync_message: `Verbunden als ${testData.data?.name ?? "Unbekannt"}`,
      })
      .select("id, domain, sync_interval_minutes, is_active, created_at")
      .single();

    if (insErr) {
      return jsonResponse({ ok: false, error: "insert_failed", message: insErr.message }, 500);
    }

    const tokenPreview = `${String(apiToken).slice(0, 4)}…${String(apiToken).slice(-4)}`;

    return jsonResponse({
      ok: true,
      settings: inserted,
      tokenPreview,
      user: {
        name: testData.data?.name,
        email: testData.data?.email,
        company_name: testData.data?.company_name,
      },
    });
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: "internal_error", message: e?.message ?? String(e) },
      500,
    );
  }
});
