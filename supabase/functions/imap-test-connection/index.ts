import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  getAuthedUser,
} from "../_shared/imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await getAuthedUser(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const { imapHost, imapPort, imapSecure, imapUser, imapPassword } = body ?? {};
  if (!imapHost || !imapPort || !imapUser || !imapPassword) {
    return errorResponse("Missing required fields", 400);
  }

  const client = new ImapFlow({
    host: imapHost,
    port: Number(imapPort),
    secure: imapSecure !== false,
    auth: { user: imapUser, pass: imapPassword },
    logger: false,
    socketTimeout: 15000,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();
    let inboxCount = 0;
    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const status = await client.status("INBOX", { messages: true });
        inboxCount = status.messages ?? 0;
      } finally {
        lock.release();
      }
    } catch {
      // ignore
    }
    await client.logout();
    return jsonResponse({
      ok: true,
      mailboxes: mailboxes.map((m: any) => ({
        path: m.path,
        name: m.name,
        specialUse: m.specialUse ?? null,
        flags: Array.from(m.flags ?? []),
      })),
      inboxCount,
    });
  } catch (err) {
    const e = err as { message?: string; authenticationFailed?: boolean; code?: string };
    let code = "unknown";
    const message = e?.message ?? String(err);
    if (e?.authenticationFailed || /authentication failed|LOGIN|AUTHENTICATIONFAILED/i.test(message)) {
      code = "auth_failed";
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(message)) {
      code = "connection_failed";
    } else if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(message)) {
      code = "connection_failed";
    } else if (/SSL|TLS|wrong version|certificate/i.test(message)) {
      code = "tls_error";
    }
    try { await client.close(); } catch { /* ignore */ }
    return jsonResponse({ ok: false, error: code, message }, 200);
  }
});
