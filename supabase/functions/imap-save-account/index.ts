import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  getAuthedUser,
  getServiceClient,
  getEnv,
} from "../_shared/imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await getAuthedUser(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }

  const {
    id,
    email_address,
    display_name,
    provider,
    imap_host,
    imap_port,
    imap_secure,
    imap_user,
    imap_password,
    smtp_host,
    smtp_port,
    smtp_secure,
    is_default,
    last_test_status,
  } = body ?? {};

  if (!email_address || !imap_host || !imap_port || !imap_user) {
    return errorResponse("Missing required fields", 400);
  }
  // Password required on insert; on update only if rotating
  if (!id && !imap_password) {
    return errorResponse("Password required for new accounts", 400);
  }

  const svc = getServiceClient();
  const { encryptionKey } = getEnv();

  let encryptedPw: string | undefined;
  if (imap_password) {
    const { data, error } = await svc.rpc("encrypt_imap_password", {
      password: imap_password,
      encryption_key: encryptionKey,
    });
    if (error) return errorResponse(`Encrypt failed: ${error.message}`, 500);
    encryptedPw = data as string;
  }

  if (id) {
    // Update — verify ownership
    const { data: existing } = await svc
      .from("email_accounts")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) return errorResponse("Account not found", 404);
    if (existing.user_id !== auth.userId) return errorResponse("Forbidden", 403);

    const update: Record<string, unknown> = {
      email_address,
      display_name: display_name ?? null,
      provider: provider ?? null,
      imap_host,
      imap_port: Number(imap_port),
      imap_secure: imap_secure !== false,
      imap_user,
      smtp_host: smtp_host ?? null,
      smtp_port: smtp_port ? Number(smtp_port) : null,
      smtp_secure: smtp_secure !== false,
      last_tested_at: new Date().toISOString(),
      last_test_status: last_test_status ?? "ok",
      last_test_error: null,
    };
    if (encryptedPw) update.imap_password_encrypted = encryptedPw;
    if (typeof is_default === "boolean") update.is_default = is_default;

    if (is_default === true) {
      await svc.from("email_accounts").update({ is_default: false }).eq("user_id", auth.userId);
    }

    const { data, error } = await svc.from("email_accounts").update(update).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true, account: data });
  }

  // Insert
  // If first account or is_default true → set default
  const { count } = await svc
    .from("email_accounts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  const shouldBeDefault = is_default === true || (count ?? 0) === 0;
  if (shouldBeDefault) {
    await svc.from("email_accounts").update({ is_default: false }).eq("user_id", auth.userId);
  }

  const insertRow = {
    user_id: auth.userId,
    email_address,
    display_name: display_name ?? null,
    provider: provider ?? null,
    imap_host,
    imap_port: Number(imap_port),
    imap_secure: imap_secure !== false,
    imap_user,
    imap_password_encrypted: encryptedPw!,
    smtp_host: smtp_host ?? null,
    smtp_port: smtp_port ? Number(smtp_port) : null,
    smtp_secure: smtp_secure !== false,
    is_default: shouldBeDefault,
    is_active: true,
    last_tested_at: new Date().toISOString(),
    last_test_status: last_test_status ?? "ok",
  };

  const { data, error } = await svc.from("email_accounts").insert(insertRow).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") return errorResponse("Konto mit dieser E-Mail-Adresse existiert bereits", 409);
    return errorResponse(error.message, 500);
  }
  return jsonResponse({ ok: true, account: data });
});
