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

// Returns lowercase "type/subtype" tuple from a node — handles imapflow's
// combined `type` ("text/plain") or split (`type`/`subtype`) forms.
function nodeMime(struct: any): { type: string; subtype: string } {
  const t = (struct.type || "").toString().toLowerCase();
  if (t.includes("/")) {
    const [a, b = ""] = t.split("/");
    return { type: a, subtype: b };
  }
  return { type: t, subtype: (struct.subtype || "").toString().toLowerCase() };
}

function nodeChildren(struct: any): any[] | null {
  const c = struct.childNodes || struct.children || struct.childParts || null;
  return Array.isArray(c) && c.length > 0 ? c : null;
}

function findTextParts(struct: any, path = ""): TextPart[] {
  if (!struct) return [];
  const results: TextPart[] = [];

  const children = nodeChildren(struct);
  if (children) {
    children.forEach((child: any, idx: number) => {
      // imapflow nodes may already carry their own .part path — prefer it
      const newPath = child.part || (path ? `${path}.${idx + 1}` : String(idx + 1));
      results.push(...findTextParts(child, newPath));
    });
    return results;
  }

  const { type, subtype } = nodeMime(struct);
  const disposition = (struct.disposition || "").toLowerCase();
  const filename = struct.dispositionParameters?.filename || struct.parameters?.name;
  const isAttachment = disposition === "attachment" || (!!filename && type !== "text");

  if (!isAttachment && type === "text" && (subtype === "plain" || subtype === "html")) {
    results.push({
      type: `${type}/${subtype}` as TextPart["type"],
      path: struct.part || path || "1",
      size: struct.size || 0,
      encoding: (struct.encoding || "7bit").toLowerCase(),
      charset: (struct.parameters?.charset || struct.dispositionParameters?.charset || "utf-8").toLowerCase(),
    });
  }
  return results;
}

function findAttachments(struct: any, path = ""): AttachmentMeta[] {
  if (!struct) return [];
  const children = nodeChildren(struct);
  if (children) {
    return children.flatMap((child: any, idx: number) => {
      const p = child.part || (path ? `${path}.${idx + 1}` : String(idx + 1));
      return findAttachments(child, p);
    });
  }
  const disposition = (struct.disposition || "").toLowerCase();
  const filename = struct.dispositionParameters?.filename || struct.parameters?.name;
  const { type, subtype } = nodeMime(struct);
  if (disposition === "attachment" || (filename && type !== "text")) {
    return [{
      filename: filename || "unbenannt",
      size: struct.size || 0,
      contentType: `${type}/${subtype}`,
      encoding: (struct.encoding || "7bit").toLowerCase(),
      path: struct.part || path || "1",
    }];
  }
  return [];
}

// ---------- decoders ----------

function decodeWithCharset(buffer: Uint8Array, charset: string): string {
  const cs = (charset || "utf-8").toLowerCase();
  const normalized =
    cs === "utf8" ? "utf-8" :
    cs === "latin1" ? "iso-8859-1" :
    cs === "us-ascii" || cs === "ascii" ? "utf-8" :
    cs;
  try {
    return new TextDecoder(normalized, { fatal: false }).decode(buffer);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  }
}

function decodeQuotedPrintable(str: string): string {
  // Soft line breaks
  const noSoftBreaks = str.replace(/=\r?\n/g, "");
  // Decode hex sequences as raw bytes, then reinterpret runs of bytes as utf-8
  const bytes: number[] = [];
  let i = 0;
  while (i < noSoftBreaks.length) {
    const ch = noSoftBreaks[i];
    if (ch === "=" && i + 2 < noSoftBreaks.length) {
      const hex = noSoftBreaks.substr(i + 1, 2);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    bytes.push(ch.charCodeAt(0) & 0xff);
    i++;
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function decodePart(buffer: Uint8Array, encoding: string, charset: string): string {
  const enc = (encoding || "7bit").toLowerCase();

  if (enc === "base64") {
    try {
      const b64 = new TextDecoder("ascii").decode(buffer).replace(/\s/g, "");
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return decodeWithCharset(bytes, charset);
    } catch {
      return decodeWithCharset(buffer, charset);
    }
  }

  if (enc === "quoted-printable") {
    // QP works on ASCII text — read raw, then decode QP (which yields utf-8 bytes for most modern mails)
    const raw = new TextDecoder("ascii", { fatal: false }).decode(buffer);
    return decodeQuotedPrintable(raw);
  }

  // 7bit / 8bit / binary
  return decodeWithCharset(buffer, charset);
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

  // Cache hit (only if non-empty body) — return immediately
  const { data: cached } = await svc
    .from("email_messages_cache")
    .select("*")
    .eq("account_id", accountId)
    .eq("folder", folder)
    .eq("uid", Number(uid))
    .maybeSingle();

  const cachedHasBody =
    cached?.body_fetched_at &&
    ((cached.body_text && cached.body_text.length >= 10) ||
      (cached.body_html && cached.body_html.length >= 10));

  if (cachedHasBody) {
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
    socketTimeout: 25_000,
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

          // ---- Step 3: download text parts ----
          for (const part of textParts) {
            if (part.size > 2_000_000) {
              log(`Skip part ${part.path} — too large (${part.size}b)`);
              continue;
            }
            log(`Download part ${part.path} (${part.type}, ${part.size}b, enc=${part.encoding}, cs=${part.charset})`);
            try {
              const partData = await raceTimeout(
                client.download(String(uid), part.path, { uid: true }) as any,
                15_000,
                `part-${part.path}`,
              );
              if (!partData?.content) {
                log(`No content for part ${part.path}`);
                continue;
              }
              const buf = await streamToBuffer(partData.content);
              const decoded = decodePart(buf, part.encoding, part.charset);
              if (part.type === "text/plain" && !bodyText) bodyText = decoded;
              else if (part.type === "text/html" && !bodyHtml) bodyHtml = decoded;
              else if (part.type === "text/plain") bodyText += decoded;
              else if (part.type === "text/html") bodyHtml += decoded;
              log(`Part ${part.path} → ${decoded.length} chars`);
            } catch (partErr) {
              log(`Part ${part.path} failed: ${(partErr as Error).message}`);
              // continue with other parts
            }
          }

          // ---- Step 3b: fallback — full source + mailparser if structure walk missed everything ----
          if (!bodyText && !bodyHtml) {
            log("WARNING: No text parts found via BODYSTRUCTURE — fallback to full source + mailparser");
            try {
              let sourceMsg: any = null;
              await raceTimeout(
                (async () => {
                  for await (const m of client.fetch(
                    String(uid),
                    { source: true },
                    { uid: true },
                  )) {
                    sourceMsg = m;
                    break;
                  }
                })(),
                20_000,
                "source-fetch",
              );
              if (sourceMsg?.source) {
                log(`Got source (${sourceMsg.source.length}b), parsing...`);
                const { simpleParser } = await import("npm:mailparser@3.6.5");
                const parsed = await raceTimeout(
                  simpleParser(sourceMsg.source) as any,
                  10_000,
                  "mailparser",
                );
                bodyText = parsed.text || "";
                bodyHtml = parsed.html || "";
                log(`Fallback parsed: text=${bodyText.length} html=${bodyHtml.length}`);
              } else {
                log("Source fetch returned empty");
              }
            } catch (fbErr) {
              log(`Fallback parse failed: ${(fbErr as Error).message}`);
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

  if (opError && !bodyText && !bodyHtml) {
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
    body_fetched_at: (bodyText || bodyHtml) ? new Date().toISOString() : null,
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

  log(`Done in ${Date.now() - t0}ms (text=${bodyText.length}, html=${bodyHtml.length}, attach=${attachments.length})`);
  return jsonResponse({ ok: true, message: updated ?? updateRow, cached: false });
}
