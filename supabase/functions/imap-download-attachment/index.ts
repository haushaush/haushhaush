import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders,
  errorResponse,
  getAuthedUser,
  loadAccountForUser,
  getServiceClient,
  mapImapError,
  withAccountLock,
  withTimeout,
  IMAP_TIMEOUTS,
} from "../_shared/imap-helpers.ts";

function decodeQuotedPrintableBytes(input: Uint8Array): Uint8Array {
  // Convert to ASCII string, decode QP escapes byte-by-byte
  const str = new TextDecoder("latin1").decode(input).replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "=" && i + 2 < str.length) {
      const hex = str.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    out.push(str.charCodeAt(i));
  }
  return Uint8Array.from(out);
}

function decodeBase64Bytes(input: Uint8Array): Uint8Array {
  const cleaned = new TextDecoder("latin1").decode(input).replace(/\s/g, "");
  const bin = atob(cleaned);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function streamToBuffer(stream: any): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  if (stream instanceof Uint8Array) return stream;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf;
}

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

  const start = Date.now();
  console.log(`[imap-download-attachment] start accountId=${accountId} uid=${uid} attachmentId=${attachmentId}`);

  // Look up attachment metadata from cache (path + filename + encoding)
  const svc = getServiceClient();
  const { data: cached } = await svc
    .from("email_messages_cache")
    .select("attachments")
    .eq("account_id", accountId)
    .eq("folder", folder)
    .eq("uid", Number(uid))
    .maybeSingle();

  const idx = Number(attachmentId);
  const attMeta = (cached?.attachments as any[] | null)?.[idx];
  if (!attMeta || !attMeta.path) {
    return errorResponse(
      "Attachment-Metadaten nicht gefunden — bitte E-Mail erneut öffnen und neu laden",
      404,
    );
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
    ...IMAP_TIMEOUTS,
  });

  try {
    const buffer = await withAccountLock(accountId, () =>
      withTimeout(
        (async () => {
          await client.connect();
          const lock = await client.getMailboxLock(folder);
          try {
            const partData = await client.download(String(uid), attMeta.path, { uid: true });
            const raw = await streamToBuffer((partData as any)?.content);
            // Decode transfer-encoding
            const enc = (attMeta.encoding || "7bit").toLowerCase();
            if (enc === "base64") return decodeBase64Bytes(raw);
            if (enc === "quoted-printable") return decodeQuotedPrintableBytes(raw);
            return raw;
          } finally {
            lock.release();
          }
        })(),
        45_000,
        "imap-download-attachment",
      ),
    );

    try { await withTimeout(client.logout(), 5_000, "imap-logout"); }
    catch { try { await client.close(); } catch { /* */ } }

    const filename = attMeta.filename ?? `attachment-${idx + 1}`;
    const contentType = attMeta.contentType ?? "application/octet-stream";

    console.log(`[imap-download-attachment] done in ${Date.now() - start}ms (${buffer.byteLength} bytes)`);
    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error(`[imap-download-attachment] error after ${Date.now() - start}ms:`, (err as Error).message);
    try { await client.close(); } catch { /* */ }
    const mapped = mapImapError(err);
    return errorResponse(mapped.message, 500);
  }
});
