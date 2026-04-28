import {
  corsHeaders, jsonResponse, errorResponse, getAdminUser, getServiceClient, getEnv,
} from "../_shared/shared-imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await getAdminUser(req);
  if (!auth) return errorResponse("Forbidden — admin role required", 403);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }

  const {
    id, email_address, display_name, provider,
    imap_host, imap_port, imap_secure, imap_user, imap_password,
    smtp_host, smtp_port, smtp_secure,
    is_default, last_test_status,
  } = body ?? {};

  if (!email_address || !imap_host || !imap_port || !imap_user) {
    return errorResponse("Missing required fields", 400);
  }
  if (!id && !imap_password) {
    return errorResponse("Password required for new accounts", 400);
  }

  const effective_smtp_host = smtp_host || imap_host;
  const effective_smtp_port = smtp_port ?? 465;
  const effective_smtp_secure = smtp_secure !== false;

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
    const { data: existing } = await svc
      .from("shared_email_accounts").select("id").eq("id", id).maybeSingle();
    if (!existing) return errorResponse("Account not found", 404);

    const update: Record<string, unknown> = {
      email_address,
      display_name: display_name ?? null,
      provider: provider ?? null,
      imap_host,
      imap_port: Number(imap_port),
      imap_secure: imap_secure !== false,
      imap_user,
      smtp_host: effective_smtp_host,
      smtp_port: effective_smtp_port,
      smtp_secure: effective_smtp_secure,
      last_tested_at: new Date().toISOString(),
      last_test_status: last_test_status ?? "ok",
      last_test_error: null,
    };
    if (encryptedPw) update.imap_password_encrypted = encryptedPw;
    if (typeof is_default === "boolean") update.is_default = is_default;

    if (is_default === true) {
      await svc.from("shared_email_accounts").update({ is_default: false }).eq("is_default", true);
    }

    const { data, error } = await svc.from("shared_email_accounts").update(update).eq("id", id).select("*").maybeSingle();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true, account: data });
  }

  // Insert
  const { count } = await svc
    .from("shared_email_accounts").select("*", { count: "exact", head: true });

  const shouldBeDefault = is_default === true || (count ?? 0) === 0;
  if (shouldBeDefault) {
    await svc.from("shared_email_accounts").update({ is_default: false }).eq("is_default", true);
  }

  const insertRow = {
    email_address,
    display_name: display_name ?? null,
    provider: provider ?? null,
    imap_host,
    imap_port: Number(imap_port),
    imap_secure: imap_secure !== false,
    imap_user,
    imap_password_encrypted: encryptedPw!,
    smtp_host: effective_smtp_host,
    smtp_port: effective_smtp_port,
    smtp_secure: effective_smtp_secure,
    is_default: shouldBeDefault,
    is_active: true,
    last_tested_at: new Date().toISOString(),
    last_test_status: last_test_status ?? "ok",
    created_by: auth.userId,
  };

  const { data, error } = await svc.from("shared_email_accounts").insert(insertRow).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") return errorResponse("Konto mit dieser E-Mail-Adresse existiert bereits", 409);
    return errorResponse(error.message, 500);
  }
  return jsonResponse({ ok: true, account: data });
});
