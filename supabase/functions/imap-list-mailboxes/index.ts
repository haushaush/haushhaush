import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  getAuthedUser,
  loadAccountForUser,
  mapImapError,
} from "../_shared/imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  const auth = await getAuthedUser(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const { accountId } = body ?? {};
  if (!accountId) return errorResponse("Missing accountId", 400);

  const result = await loadAccountForUser(auth.userId, accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;

  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false,
    socketTimeout: 15000,
  });

  try {
    await client.connect();
    const mailboxes = await client.list({ statusQuery: { messages: true, unseen: true } });
    await client.logout();

    const folders = mailboxes.map((m: any) => ({
      path: m.path,
      name: m.name,
      specialUse: m.specialUse ?? null,
      messageCount: m.status?.messages ?? null,
      unreadCount: m.status?.unseen ?? null,
      delimiter: m.delimiter,
    }));
    return jsonResponse({ ok: true, folders });
  } catch (err) {
    try { await client.close(); } catch { /* */ }
    const mapped = mapImapError(err);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }
});
