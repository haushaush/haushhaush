import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders, jsonResponse, errorResponse, getAdminUser, loadSharedAccount, getServiceClient,
  mapImapError, withAccountLock, withTimeout, IMAP_TIMEOUTS,
} from "../_shared/shared-imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await getAdminUser(req);
  if (!auth) return errorResponse("Forbidden — admin role required", 403);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const { accountId, folder = "INBOX", uid, read } = body ?? {};
  if (!accountId || !uid || typeof read !== "boolean") {
    return errorResponse("Missing accountId, uid or read", 400);
  }

  const result = await loadSharedAccount(accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;
  const svc = getServiceClient();

  const client = new ImapFlow({
    host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false, ...IMAP_TIMEOUTS,
  });

  try {
    await withAccountLock(accountId, () =>
      withTimeout((async () => {
        await client.connect();
        const lock = await client.getMailboxLock(folder);
        try {
          if (read) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
        } finally { lock.release(); }
      })(), 30_000, "shared-imap-mark-read"),
    );

    try { await withTimeout(client.logout(), 5_000, "imap-logout"); }
    catch { try { await client.close(); } catch { /* */ } }

    const { data: row } = await svc
      .from("shared_email_messages_cache")
      .select("flags")
      .eq("account_id", accountId).eq("folder", folder).eq("uid", Number(uid))
      .maybeSingle();
    if (row) {
      const flagsSet = new Set<string>(row.flags ?? []);
      if (read) flagsSet.add("\\Seen"); else flagsSet.delete("\\Seen");
      await svc.from("shared_email_messages_cache")
        .update({ flags: Array.from(flagsSet) })
        .eq("account_id", accountId).eq("folder", folder).eq("uid", Number(uid));
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    try { await client.close(); } catch { /* */ }
    const mapped = mapImapError(err);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }
});
