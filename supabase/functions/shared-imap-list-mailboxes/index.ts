import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders, jsonResponse, errorResponse, getAdminUser, loadSharedAccount,
  mapImapError, withAccountLock, withTimeout, IMAP_TIMEOUTS,
} from "../_shared/shared-imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await getAdminUser(req);
  if (!auth) return errorResponse("Forbidden — admin role required", 403);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const { accountId } = body ?? {};
  if (!accountId) return errorResponse("Missing accountId", 400);

  const start = Date.now();
  console.log(`[shared-imap-list-mailboxes] start accountId=${accountId}`);

  const result = await loadSharedAccount(accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;

  const client = new ImapFlow({
    host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false, ...IMAP_TIMEOUTS,
  });

  try {
    const mailboxes = await withAccountLock(accountId, () =>
      withTimeout((async () => {
        await client.connect();
        return await client.list({ statusQuery: { messages: true, unseen: true } });
      })(), 45_000, "shared-imap-list-mailboxes"),
    );

    try { await withTimeout(client.logout(), 5_000, "imap-logout"); }
    catch { try { await client.close(); } catch { /* ignore */ } }

    const folders = mailboxes.map((m: any) => ({
      path: m.path, name: m.name, specialUse: m.specialUse ?? null,
      messageCount: m.status?.messages ?? null, unreadCount: m.status?.unseen ?? null,
      delimiter: m.delimiter,
    }));
    console.log(`[shared-imap-list-mailboxes] done in ${Date.now() - start}ms (${folders.length} folders)`);
    return jsonResponse({ ok: true, folders });
  } catch (err) {
    console.error(`[shared-imap-list-mailboxes] error:`, (err as Error).message);
    try { await client.close(); } catch { /* */ }
    const mapped = mapImapError(err);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }
});
