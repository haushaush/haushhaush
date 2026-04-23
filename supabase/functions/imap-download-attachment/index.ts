import { ImapFlow } from "npm:imapflow@1.0.151";
import { simpleParser } from "npm:mailparser@3.6.5";
import {
  corsHeaders,
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
  const { accountId, folder = "INBOX", uid, attachmentId } = body ?? {};
  if (!accountId || !uid || attachmentId === undefined || attachmentId === null) {
    return errorResponse("Missing accountId, uid or attachmentId", 400);
  }

  const result = await loadAccountForUser(auth.userId, accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;

  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false,
    socketTimeout: 30000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    let parsed: any;
    try {
      const fetched = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!fetched) throw new Error("Message not found");
      parsed = await simpleParser((fetched as any).source);
    } finally {
      lock.release();
    }
    await client.logout();

    const idx = Number(attachmentId);
    const att = (parsed.attachments ?? [])[idx];
    if (!att) return errorResponse("Attachment not found", 404);

    const filename = att.filename ?? `attachment-${idx + 1}`;
    const contentType = att.contentType ?? "application/octet-stream";
    const content: Uint8Array = att.content instanceof Uint8Array
      ? att.content
      : new Uint8Array(att.content);

    return new Response(content, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(content.byteLength),
      },
    });
  } catch (err) {
    try { await client.close(); } catch { /* */ }
    const mapped = mapImapError(err);
    return errorResponse(mapped.message, 500);
  }
});
