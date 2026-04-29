import {
  corsHeaders,
  jsonResponse,
  pipedriveTestCredentials,
  requireAdmin,
  encryptToken,
} from "../_shared/pipedrive-helpers.ts";

interface Body {
  id?: string;                       // when present → update existing
  name?: string;
  domain?: string;
  apiToken?: string;                 // required for create; optional for update (only if rotating)
  linkedKundeId?: string | null;
  color?: string;
  syncIntervalMinutes?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const { svc, userId } = auth;

    const body = (await req.json().catch(() => ({}))) as Body;
    const { id, name, domain, apiToken, linkedKundeId, color, syncIntervalMinutes } = body ?? {};

    const isUpdate = !!id;

    if (!isUpdate) {
      if (!name || !domain || !apiToken) {
        return jsonResponse({ ok: false, error: "name, domain and apiToken are required" }, 400);
      }
    }

    // If credentials are being set/rotated, validate against Pipedrive
    let cachedUser: any = null;
    let cleanedDomain: string | undefined;
    if (apiToken && domain) {
      const test = await pipedriveTestCredentials(domain, apiToken);
      if (!test.ok) {
        return jsonResponse({
          ok: false,
          error: "auth_failed",
          message: test.data?.error || "Verbindung zu Pipedrive fehlgeschlagen",
        });
      }
      cachedUser = test.data.data;
      cleanedDomain = test.cleanedDomain;
    }

    if (isUpdate) {
      const update: Record<string, any> = { updated_at: new Date().toISOString() };
      if (name !== undefined) update.name = name;
      if (cleanedDomain) update.domain = cleanedDomain;
      if (linkedKundeId !== undefined) update.linked_kunde_id = linkedKundeId;
      if (color) update.color_hex = color;
      if (typeof syncIntervalMinutes === "number") update.sync_interval_minutes = syncIntervalMinutes;
      if (apiToken) {
        update.api_token_encrypted = await encryptToken(svc, apiToken);
      }
      if (cachedUser) {
        update.pipedrive_user_id = cachedUser.id;
        update.pipedrive_user_name = cachedUser.name;
        update.pipedrive_user_email = cachedUser.email;
        update.pipedrive_company_name = cachedUser.company_name;
      }

      const { data, error } = await svc
        .from("pipedrive_accounts")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
      if (error) {
        return jsonResponse({ ok: false, error: "update_failed", message: error.message }, 500);
      }
      return jsonResponse({ ok: true, account: data });
    }

    // Insert
    const encrypted = await encryptToken(svc, apiToken!);
    const { data, error } = await svc
      .from("pipedrive_accounts")
      .insert({
        name,
        domain: cleanedDomain!,
        api_token_encrypted: encrypted,
        linked_kunde_id: linkedKundeId ?? null,
        color_hex: color || "#0EA5E9",
        sync_interval_minutes: syncIntervalMinutes || 15,
        is_active: true,
        created_by: userId,
        last_sync_status: "connected",
        last_sync_message: `Verbunden als ${cachedUser?.name ?? "Unbekannt"}`,
        pipedrive_user_id: cachedUser?.id ?? null,
        pipedrive_user_name: cachedUser?.name ?? null,
        pipedrive_user_email: cachedUser?.email ?? null,
        pipedrive_company_name: cachedUser?.company_name ?? null,
      })
      .select("*")
      .single();

    if (error) {
      // Friendly error for unique-domain violation
      if (String(error.message).includes("pipedrive_accounts_domain")) {
        return jsonResponse({
          ok: false,
          error: "duplicate_domain",
          message: `Es gibt bereits einen Pipedrive-Account für ${cleanedDomain}.pipedrive.com`,
        });
      }
      return jsonResponse({ ok: false, error: "insert_failed", message: error.message }, 500);
    }

    return jsonResponse({ ok: true, account: data });
  } catch (e: any) {
    return jsonResponse(
      { ok: false, error: "internal_error", message: e?.message ?? String(e) },
      500,
    );
  }
});
