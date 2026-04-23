import { ImapFlow } from "npm:imapflow@1.0.151";
import { simpleParser } from "npm:mailparser@3.6.5";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[imap-get-message +${Date.now() - t0}ms] ${msg}`);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { accountId, folder, uid } = await req.json();
    log(`START accountId=${accountId} folder=${folder} uid=${uid}`);

    if (!accountId || !folder || uid === undefined) {
      return json({ ok: false, error: 'missing_params' }, 400);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);
    log(`USER ${user.id}`);

    const { data: cachedRow } = await supabaseClient
      .from('email_messages_cache')
      .select('*')
      .eq('account_id', accountId)
      .eq('folder', folder)
      .eq('uid', uid)
      .maybeSingle();

    if (cachedRow?.body_fetched_at && (cachedRow.body_text || cachedRow.body_html)) {
      log(`CACHE HIT with body (text=${cachedRow.body_text?.length ?? 0} html=${cachedRow.body_html?.length ?? 0})`);
      return json({ ok: true, message: cachedRow, cached: true });
    }

    log(`CACHE MISS or empty body — fetching from IMAP`);

    const { data: account, error: accErr } = await supabaseClient
      .from('email_accounts')
      .select('id, user_id, imap_host, imap_port, imap_secure, imap_user, imap_password_encrypted')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (accErr || !account) {
      log(`Account not found: ${accErr?.message || 'no row'}`);
      return json({ ok: false, error: 'Account not found' }, 404);
    }
    log(`Account found: ${account.imap_host}`);

    const { data: decryptedPw, error: decryptErr } = await supabaseClient
      .rpc('decrypt_imap_password', {
        encrypted: account.imap_password_encrypted,
        encryption_key: Deno.env.get('IMAP_ENCRYPTION_KEY')!,
      });
    if (decryptErr || !decryptedPw) {
      log(`Decrypt failed: ${decryptErr?.message}`);
      return json({ ok: false, error: 'decrypt_failed' }, 500);
    }
    log(`Password decrypted`);

    const client = new ImapFlow({
      host: account.imap_host,
      port: account.imap_port,
      secure: account.imap_secure,
      auth: { user: account.imap_user, pass: decryptedPw },
      logger: false,
      connectTimeout: 10_000,
      greetingTimeout: 8_000,
      socketTimeout: 30_000,
    });

    client.on('error', (err) => log(`IMAP error event: ${err.message}`));

    let bodyText = '';
    let bodyHtml: string | null = null;
    let attachments: Array<any> = [];
    let envelope: any = null;

    try {
      log(`Connecting IMAP ${account.imap_host}:${account.imap_port}...`);
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connect timeout 12s')), 12_000)),
      ]);
      log(`Connected`);

      const lock = await Promise.race([
        client.getMailboxLock(folder),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout 10s')), 10_000)),
      ]) as Awaited<ReturnType<typeof client.getMailboxLock>>;
      log(`Lock acquired for ${folder}`);

      try {
        log(`Fetching UID ${uid} with source...`);
        const msg = await Promise.race([
          client.fetchOne(String(uid), {
            source: true,
            envelope: true,
            flags: true,
          }, { uid: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout 30s')), 30_000)),
        ]) as any;

        if (!msg || !msg.source) {
          throw new Error(`UID ${uid} not found or empty source`);
        }
        log(`Fetched. Source size: ${msg.source.length} bytes`);
        envelope = msg.envelope;

        log(`Parsing with mailparser...`);
        const parsed = await Promise.race([
          simpleParser(msg.source),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Parse timeout 15s')), 15_000)),
        ]) as any;
        log(`Parsed: text=${parsed.text?.length ?? 0} html=${typeof parsed.html === 'string' ? parsed.html.length : 0} attachments=${parsed.attachments?.length ?? 0}`);

        bodyText = parsed.text || '';
        bodyHtml = typeof parsed.html === 'string' ? parsed.html : null;
        attachments = (parsed.attachments || []).map((a: any, idx: number) => ({
          attachmentId: `${uid}-${idx}`,
          filename: a.filename || `attachment-${idx}`,
          size: a.size || 0,
          contentType: a.contentType || 'application/octet-stream',
        }));
      } finally {
        lock.release();
        log(`Lock released`);
      }
    } finally {
      try {
        await Promise.race([
          client.logout(),
          new Promise((resolve) => setTimeout(resolve, 2_000)),
        ]);
        log(`Logged out`);
      } catch (e) {
        log(`Logout error (ignored): ${e}`);
      }
    }

    log(`UPSERTing cache...`);
    const cacheRow: any = {
      account_id: accountId,
      folder,
      uid,
      body_text: bodyText,
      body_html: bodyHtml,
      attachments,
      body_fetched_at: new Date().toISOString(),
    };
    if (envelope) {
      cacheRow.from_address = envelope.from?.[0]?.address;
      cacheRow.from_name = envelope.from?.[0]?.name;
      cacheRow.to_addresses = envelope.to?.map((t: any) => t.address) || [];
      cacheRow.cc_addresses = envelope.cc?.map((t: any) => t.address) || [];
      cacheRow.subject = envelope.subject;
      cacheRow.date = envelope.date;
      cacheRow.message_id = envelope.messageId;
    }

    const { error: upsertErr } = await supabaseClient
      .from('email_messages_cache')
      .upsert(cacheRow, { onConflict: 'account_id,folder,uid' });

    if (upsertErr) {
      log(`Cache upsert FAILED: ${upsertErr.message}`);
    } else {
      log(`Cache upserted OK`);
    }

    const { data: finalRow } = await supabaseClient
      .from('email_messages_cache')
      .select('*')
      .eq('account_id', accountId)
      .eq('folder', folder)
      .eq('uid', uid)
      .single();

    log(`RESPONSE body_text=${bodyText.length} body_html=${bodyHtml?.length ?? 0}`);
    return json({ ok: true, message: finalRow || cacheRow, cached: false });

  } catch (error) {
    const errMsg = (error as any)?.message || String(error);
    log(`FATAL ERROR: ${errMsg}`);
    return new Response(
      JSON.stringify({ ok: false, error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function json(data: any, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
