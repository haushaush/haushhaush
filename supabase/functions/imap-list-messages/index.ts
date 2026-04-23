import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  getAuthedUser,
  loadAccountForUser,
  getServiceClient,
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
  const { accountId, folder = "INBOX", limit = 50, search } = body ?? {};
  if (!accountId) return errorResponse("Missing accountId", 400);

  const result = await loadAccountForUser(auth.userId, accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;

  const svc = getServiceClient();
  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false,
    socketTimeout: 20000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    let messages: any[] = [];
    try {
      // Build search query
      const searchQuery: any = search ? { or: [{ subject: search }, { from: search }, { body: search }] } : { all: true };
      const uids: number[] = await client.search(searchQuery, { uid: true }) ?? [];
      const recent = uids.slice(-Number(limit));

      if (recent.length > 0) {
        for await (const msg of client.fetch(
          recent,
          { envelope: true, flags: true, bodyStructure: true, size: true, internalDate: true },
          { uid: true },
        )) {
          const env = (msg as any).envelope ?? {};
          const fromArr = env.from ?? [];
          const toArr = env.to ?? [];
          const ccArr = env.cc ?? [];
          const bs = (msg as any).bodyStructure;
          const hasAttachment = bs ? hasAttachmentInStructure(bs) : false;

          messages.push({
            uid: Number((msg as any).uid),
            messageId: env.messageId ?? null,
            subject: env.subject ?? "",
            from_address: fromArr[0]?.address ?? null,
            from_name: fromArr[0]?.name ?? null,
            to_addresses: toArr.map((a: any) => a.address).filter(Boolean),
            cc_addresses: ccArr.map((a: any) => a.address).filter(Boolean),
            date: env.date ? new Date(env.date).toISOString() : ((msg as any).internalDate ? new Date((msg as any).internalDate).toISOString() : null),
            flags: Array.from((msg as any).flags ?? []),
            has_attachment: hasAttachment,
            size_bytes: (msg as any).size ?? null,
          });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();

    // Upsert into cache
    if (messages.length > 0) {
      const rows = messages.map((m) => ({
        account_id: accountId,
        folder,
        uid: m.uid,
        message_id: m.messageId,
        from_address: m.from_address,
        from_name: m.from_name,
        to_addresses: m.to_addresses,
        cc_addresses: m.cc_addresses,
        subject: m.subject,
        snippet: null,
        date: m.date,
        flags: m.flags,
        has_attachment: m.has_attachment,
        size_bytes: m.size_bytes,
        fetched_at: new Date().toISOString(),
      }));
      await svc.from("email_messages_cache").upsert(rows, { onConflict: "account_id,folder,uid", ignoreDuplicates: false });
    }

    // Update last_user_activity_at
    await svc.from("email_accounts").update({ last_user_activity_at: new Date().toISOString() }).eq("id", accountId);

    // Return cached list (newest first)
    const { data: cached } = await svc
      .from("email_messages_cache")
      .select("*")
      .eq("account_id", accountId)
      .eq("folder", folder)
      .order("date", { ascending: false, nullsFirst: false })
      .limit(Number(limit));

    return jsonResponse({ ok: true, messages: cached ?? [] });
  } catch (err) {
    try { await client.close(); } catch { /* */ }
    const mapped = mapImapError(err);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }
});

function hasAttachmentInStructure(bs: any): boolean {
  if (!bs) return false;
  if (Array.isArray(bs.childNodes)) {
    return bs.childNodes.some((c: any) => hasAttachmentInStructure(c));
  }
  const disposition = (bs.disposition || "").toLowerCase();
  if (disposition === "attachment") return true;
  if (bs.dispositionParameters?.filename) return true;
  return false;
}
