import { ImapFlow } from "npm:imapflow@1.0.151";
import { simpleParser } from "npm:mailparser@3.6.5";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  getAuthedUser,
  loadAccountForUser,
  getServiceClient,
  mapImapError,
  withAccountLock,
  withTimeout,
  IMAP_TIMEOUTS,
} from "../_shared/imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const auth = await getAuthedUser(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const { accountId, folder = "INBOX", uid } = body ?? {};
  if (!accountId || !uid) return errorResponse("Missing accountId or uid", 400);

  const start = Date.now();
  console.log(`[imap-get-message] start accountId=${accountId} folder=${folder} uid=${uid}`);

  const result = await loadAccountForUser(auth.userId, accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;

  const svc = getServiceClient();

  // Cache check — return immediately if we already have the body
  const { data: cached } = await svc
    .from("email_messages_cache")
    .select("*")
    .eq("account_id", accountId)
    .eq("folder", folder)
    .eq("uid", Number(uid))
    .maybeSingle();

  if (cached?.body_fetched_at) {
    console.log(`[imap-get-message] cache hit in ${Date.now() - start}ms`);
    return jsonResponse({ ok: true, message: cached, cached: true });
  }

  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false,
    ...IMAP_TIMEOUTS,
  });

  try {
    const fetched = await withAccountLock(accountId, () =>
      withTimeout(
        (async () => {
          await client.connect();
          const lock = await client.getMailboxLock(folder);
          try {
            const msg = await client.fetchOne(
              String(uid),
              { source: true, flags: true, envelope: true },
              { uid: true },
            );
            if (!msg) throw new Error("Message not found");
            const flags = Array.from((msg as any).flags ?? []);
            const parsed = await simpleParser((msg as any).source);
            return { parsed, flags };
          } finally {
            lock.release();
          }
        })(),
        60_000,
        "imap-get-message",
      ),
    );

    // Always close the connection, but never let cleanup hang the response
    try {
      await withTimeout(client.logout(), 5_000, "imap-logout");
    } catch (e) {
      console.warn(`[imap-get-message] logout error (non-fatal):`, (e as Error).message);
      try { await client.close(); } catch { /* ignore */ }
    }

    const { parsed, flags } = fetched;

    const attachments = (parsed.attachments ?? []).map((a: any, idx: number) => ({
      filename: a.filename ?? `attachment-${idx + 1}`,
      contentType: a.contentType,
      size: a.size,
      contentId: a.contentId ?? null,
      attachmentId: idx,
    }));

    const updateRow = {
      account_id: accountId,
      folder,
      uid: Number(uid),
      message_id: parsed.messageId ?? cached?.message_id ?? null,
      from_address: parsed.from?.value?.[0]?.address ?? cached?.from_address ?? null,
      from_name: parsed.from?.value?.[0]?.name ?? cached?.from_name ?? null,
      to_addresses: (parsed.to?.value ?? []).map((a: any) => a.address).filter(Boolean),
      cc_addresses: (parsed.cc?.value ?? []).map((a: any) => a.address).filter(Boolean),
      subject: parsed.subject ?? cached?.subject ?? "",
      snippet: parsed.text ? parsed.text.slice(0, 200).replace(/\s+/g, " ").trim() : null,
      date: parsed.date ? new Date(parsed.date).toISOString() : cached?.date ?? null,
      flags,
      has_attachment: attachments.length > 0,
      body_text: parsed.text ?? null,
      body_html: parsed.html || null,
      attachments,
      body_fetched_at: new Date().toISOString(),
    };

    const { data: updated } = await svc
      .from("email_messages_cache")
      .upsert(updateRow, { onConflict: "account_id,folder,uid" })
      .select("*")
      .maybeSingle();

    console.log(`[imap-get-message] done in ${Date.now() - start}ms`);
    return jsonResponse({ ok: true, message: updated ?? updateRow, cached: false });
  } catch (err) {
    console.error(`[imap-get-message] error after ${Date.now() - start}ms:`, (err as Error).message);
    try { await client.close(); } catch { /* ignore */ }
    const mapped = mapImapError(err);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }
});
