import { ImapFlow } from "npm:imapflow@1.0.151";
import {
  corsHeaders,
  jsonResponse,
  errorResponse,
  getAuthedUser,
  loadAccountForUser,
  getServiceClient,
  mapImapError,
  withAccountLock,
} from "../_shared/imap-helpers.ts";

const HARD_TIMEOUT_MS = 45_000;

function raceTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms) as unknown as number;
  });
  return Promise.race([p, t]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

// ---------- BODYSTRUCTURE walkers ----------

interface TextPart {
  type: "text/plain" | "text/html";
  path: string;
  size: number;
  encoding: string;
  charset: string;
}

interface AttachmentMeta {
  filename: string;
  size: number;
  contentType: string;
  encoding: string;
  path: string;
}

function findTextParts(struct: any, path = ""): TextPart[] {
  if (!struct) return [];
  if (Array.isArray(struct.childNodes) && struct.childNodes.length > 0) {
    return struct.childNodes.flatMap((child: any, idx: number) => {
      const p = path ? `${path}.${idx + 1}` : String(idx + 1);
      return findTextParts(child, p);
    });
  }
  const mimeType = `${(struct.type || "").toLowerCase()}/${(struct.subtype || "").toLowerCase()}`;
  // Only treat as body part when it's NOT an attachment
  const disposition = (struct.disposition || "").toLowerCase();
  const filename = struct.dispositionParameters?.filename || struct.parameters?.name;
  const isAttachment = disposition === "attachment" || !!filename;
  if (!isAttachment && (mimeType === "text/plain" || mimeType === "text/html")) {
    return [{
      type: mimeType as TextPart["type"],
      path: path || "1",
      size: struct.size || 0,
      encoding: (struct.encoding || "7bit").toLowerCase(),
      charset: (struct.parameters?.charset || "utf-8").toLowerCase(),
    }];
  }
  return [];
}

function findAttachments(struct: any, path = ""): AttachmentMeta[] {
  if (!struct) return [];
  if (Array.isArray(struct.childNodes) && struct.childNodes.length > 0) {
    return struct.childNodes.flatMap((child: any, idx: number) => {
      const p = path ? `${path}.${idx + 1}` : String(idx + 1);
      return findAttachments(child, p);
    });
  }
  const disposition = (struct.disposition || "").toLowerCase();
  const filename = struct.dispositionParameters?.filename || struct.parameters?.name;
  if (disposition === "attachment" || filename) {
    return [{
      filename: filename || "unbenannt",
      size: struct.size || 0,
      contentType: `${struct.type}/${struct.subtype}`.toLowerCase(),
      encoding: (struct.encoding || "7bit").toLowerCase(),
      path: path || "1",
    }];
  }
  return [];
}

// ---------- decoders ----------

function decodeQuotedPrintable(str: string): string {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodePart(buffer: Uint8Array, encoding: string, charset: string): string {
  // Decoder selection (only iso-8859-1 is needed beyond utf-8 in practice)
  const useLatin1 = charset === "iso-8859-1" || charset === "latin1" || charset === "windows-1252";
  const decoder = new TextDecoder(useLatin1 ? "iso-8859-1" : "utf-8", { fatal: false });
  const text = decoder.decode(buffer);

  if (encoding === "quoted-printable") {
    // QP works on ASCII bytes — apply to decoded text then reinterpret hex escapes
    const qp = decodeQuotedPrintable(text);
    if (!useLatin1) {
      // QP often encodes utf-8 bytes; reinterpret resulting bytes as utf-8
      try {
        const bytes = Uint8Array.from(qp, (c) => c.charCodeAt(0) & 0xff);
        return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      } catch {
        return qp;
      }
    }
    return qp;
  }

  if (encoding === "base64") {
    try {
      const cleaned = text.replace(/\s/g, "");
      const binStr = atob(cleaned);
      const bytes = Uint8Array.from(binStr, (c) => c.charCodeAt(0));
      return new TextDecoder(useLatin1 ? "iso-8859-1" : "utf-8", { fatal: false }).decode(bytes);
    } catch {
      return text;
    }
  }

  return text;
}

// ---------- main ----------

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return Promise.race<Response>([
    handleRequest(req),
    new Promise<Response>((resolve) =>
      setTimeout(() => {
        console.error(`[imap-get-message] HARD_TIMEOUT after ${HARD_TIMEOUT_MS}ms`);
        resolve(jsonResponse(
          { ok: false, error: "hard_timeout", message: `Hard timeout nach ${HARD_TIMEOUT_MS}ms` },
          200,
        ));
      }, HARD_TIMEOUT_MS),
    ),
  ]).catch((err) => {
    console.error("[imap-get-message] Fatal:", (err as Error).message);
    return jsonResponse(
      { ok: false, error: "fatal", message: String((err as Error).message ?? err) },
      200,
    );
  });
});

async function handleRequest(req: Request): Promise<Response> {
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[imap-get-message +${Date.now() - t0}ms] ${msg}`);

  const auth = await getAuthedUser(req);
  if (!auth) return errorResponse("Unauthorized", 401);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const { accountId, folder = "INBOX", uid } = body ?? {};
  if (!accountId || !uid) return errorResponse("Missing accountId or uid", 400);

  log(`Start accountId=${accountId} folder=${folder} uid=${uid}`);

  const result = await loadAccountForUser(auth.userId, accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;
  log(`Account loaded ${acc.imap_host}:${acc.imap_port}`);

  const svc = getServiceClient();

  // Cache hit — return immediately
  const { data: cached } = await svc
    .from("email_messages_cache")
    .select("*")
    .eq("account_id", accountId)
    .eq("folder", folder)
    .eq("uid", Number(uid))
    .maybeSingle();

  if (cached?.body_fetched_at) {
    log("Cache HIT");
    return jsonResponse({ ok: true, message: cached, cached: true });
  }
  log("Cache MISS — fetching from IMAP via BODYSTRUCTURE");

  const client = new ImapFlow({
    host: acc.imap_host,
    port: acc.imap_port,
    secure: acc.imap_secure,
    auth: { user: acc.imap_user, pass: acc.password },
    logger: false,
    connectTimeout: 10_000,
    greetingTimeout: 8_000,
    socketTimeout: 20_000,
  });

  client.on("error", (err: Error) => log(`IMAP error event: ${err.message}`));

  let bodyText = "";
  let bodyHtml = "";
  let attachments: Array<AttachmentMeta & { attachmentId: number }> = [];
  let envelope: any = null;
  let flags: string[] = [];
  let opError: Error | null = null;

  try {
    await withAccountLock(accountId, async () => {
      try {
        log("Connecting...");
        await raceTimeout(client.connect(), 12_000, "connect");
        log("Connected");

        log(`Acquiring lock on ${folder}...`);
        const lock = await raceTimeout(client.getMailboxLock(folder), 10_000, "lock");
        log("Lock acquired");

        try {
          // ---- Step 1: small & fast metadata fetch ----
          log(`fetchOne envelope+bodyStructure UID=${uid}`);
          let captured: any = null;
          await raceTimeout(
            (async () => {
              for await (const m of client.fetch(
                String(uid),
                { envelope: true, bodyStructure: true, flags: true, size: true },
                { uid: true },
              )) {
                captured = m;
                break;
              }
            })(),
            15_000,
            "bodystructure",
          );
          if (!captured) throw new Error(`Message UID ${uid} not found`);
          envelope = captured.envelope ?? null;
          flags = Array.from(captured.flags ?? []);
          log(`Got bodyStructure (msg size=${captured.size})`);

          // ---- Step 2: walk structure ----
          const textParts = findTextParts(captured.bodyStructure);
          const attachMeta = findAttachments(captured.bodyStructure);
          log(`Text parts: ${textParts.length}, Attachments: ${attachMeta.length}`);

          // Fallback: if no parts identified (rare — non-MIME message), grab full source as text/plain
          if (textParts.length === 0 && attachMeta.length === 0) {
            log("No MIME parts found — fetching '1' as plaintext fallback");
            try {
              const partData = await raceTimeout(
                client.download(String(uid), "1", { uid: true }) as any,
                12_000,
                "fallback-download",
              );
              const buf = await streamToBuffer(partData?.content);
              bodyText = decodePart(buf, "7bit", "utf-8");
            } catch (e) {
              log(`Fallback download failed: ${(e as Error).message}`);
            }
          }

          // ---- Step 3: download text parts ----
          for (const part of textParts) {
            if (part.size > 1_000_000) {
              log(`Skip part ${part.path} — too large (${part.size}b)`);
              continue;
            }
            log(`Download part ${part.path} (${part.type}, ${part.size}b, enc=${part.encoding})`);
            try {
              const partData = await raceTimeout(
                client.download(String(uid), part.path, { uid: true }) as any,
                12_000,
                `part-${part.path}`,
              );
              const buf = await streamToBuffer(partData?.content);
              const decoded = decodePart(buf, part.encoding, part.charset);
              if (part.type === "text/plain") bodyText += decoded;
              else bodyHtml += decoded;
              log(`Part ${part.path} → ${decoded.length} chars`);
            } catch (partErr) {
              log(`Part ${part.path} failed: ${(partErr as Error).message}`);
              // continue with other parts — never fail entire message for one bad part
            }
          }

          // ---- Step 4: prepare attachment metadata (NOT downloaded here) ----
          attachments = attachMeta.map((a, idx) => ({ ...a, attachmentId: idx }));
        } finally {
          try { lock.release(); log("Lock released"); } catch { /* ignore */ }
        }
      } catch (e) {
        opError = e as Error;
        log(`Op error: ${(e as Error).message}`);
      } finally {
        try {
          await raceTimeout(client.logout(), 2_000, "logout");
          log("Logged out");
        } catch (e) {
          log(`Logout failed (forcing close): ${(e as Error).message}`);
          try { await client.close(); } catch { /* ignore */ }
        }
      }
    });
  } catch (e) {
    opError = (opError ?? e) as Error;
  }

  if (opError) {
    const mapped = mapImapError(opError);
    log(`Returning error: ${mapped.code} ${mapped.message}`);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }

  // Build snippet from text body
  const snippet = bodyText
    ? bodyText.slice(0, 200).replace(/\s+/g, " ").trim()
    : (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, " ").slice(0, 200).replace(/\s+/g, " ").trim() : null);

  const updateRow = {
    account_id: accountId,
    folder,
    uid: Number(uid),
    message_id: envelope?.messageId ?? cached?.message_id ?? null,
    from_address: envelope?.from?.[0]?.address ?? cached?.from_address ?? null,
    from_name: envelope?.from?.[0]?.name ?? cached?.from_name ?? null,
    to_addresses: (envelope?.to ?? []).map((a: any) => a.address).filter(Boolean),
    cc_addresses: (envelope?.cc ?? []).map((a: any) => a.address).filter(Boolean),
    subject: envelope?.subject ?? cached?.subject ?? "",
    snippet,
    date: envelope?.date ? new Date(envelope.date).toISOString() : cached?.date ?? null,
    flags,
    has_attachment: attachments.length > 0,
    body_text: bodyText || null,
    body_html: bodyHtml || null,
    attachments,
    body_fetched_at: new Date().toISOString(),
  };

  let updated: any = null;
  try {
    const upsertRes = await svc
      .from("email_messages_cache")
      .upsert(updateRow, { onConflict: "account_id,folder,uid" })
      .select("*")
      .maybeSingle();
    updated = upsertRes.data;
    log("Cache updated");
  } catch (e) {
    log(`Cache update failed (non-fatal): ${(e as Error).message}`);
  }

  log(`Done in ${Date.now() - t0}ms`);
  return jsonResponse({ ok: true, message: updated ?? updateRow, cached: false });
}

async function streamToBuffer(stream: any): Promise<Uint8Array> {
  if (!stream) return new Uint8Array(0);
  // Already a buffer/Uint8Array
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
