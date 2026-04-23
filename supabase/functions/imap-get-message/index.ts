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

Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Top-level hard budget — guarantees a response within HARD_TIMEOUT_MS
  return Promise.race<Response>([
    handleRequest(req),
    new Promise<Response>((resolve) =>
      setTimeout(() => {
        console.error(`[imap-get-message] HARD_TIMEOUT after ${HARD_TIMEOUT_MS}ms`);
        resolve(
          jsonResponse(
            { ok: false, error: "hard_timeout", message: `Hard timeout nach ${HARD_TIMEOUT_MS}ms` },
            200,
          ),
        );
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
  log("Cache MISS — fetching from IMAP");

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

  // Attach error handler BEFORE connect so we never miss a socket error event
  client.on("error", (err: Error) => log(`IMAP error event: ${err.message}`));

  let fetched: { parsed: any; flags: string[] } | null = null;
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
          log(`fetch UID=${uid} (iterator)...`);
          // Use async iterator instead of fetchOne — more reliable on slow servers
          // (fetchOne is known to hang under Deno on some IMAP servers like kasserver/All-Inkl)
          let captured: any = null;
          await raceTimeout(
            (async () => {
              for await (const m of client.fetch(
                String(uid),
                { source: true, flags: true, envelope: true },
                { uid: true },
              )) {
                captured = m;
                break; // only need the first (and only) message
              }
            })(),
            25_000,
            "fetch",
          );

          if (!captured || !captured.source) {
            throw new Error(`Message UID ${uid} not found or has no source`);
          }
          const sourceLen = captured.source?.length ?? 0;
          log(`Fetched, source size=${sourceLen}`);

          log("Parsing...");
          const parsed = await raceTimeout(simpleParser(captured.source), 10_000, "parse");
          log("Parsed");

          fetched = { parsed, flags: Array.from(captured.flags ?? []) };
        } finally {
          try { lock.release(); log("Lock released"); } catch { /* ignore */ }
        }
      } catch (e) {
        opError = e as Error;
        log(`Op error: ${(e as Error).message}`);
      } finally {
        // Force socket close — logout can hang on broken connections
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

  if (opError || !fetched) {
    const mapped = mapImapError(opError ?? new Error("Unknown fetch failure"));
    log(`Returning error: ${mapped.code} ${mapped.message}`);
    return jsonResponse({ ok: false, error: mapped.code, message: mapped.message }, 200);
  }

  // TS: narrow non-null after guard
  const { parsed, flags } = fetched as { parsed: any; flags: string[] };

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
