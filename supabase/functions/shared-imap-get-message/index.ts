import { ImapFlow } from "npm:imapflow@1.0.151";
import { simpleParser } from "npm:mailparser@3.6.5";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function decodeWithCharset(buffer: Uint8Array, charset: string): string {
  const cs = (charset || 'utf-8').toLowerCase().replace('utf8', 'utf-8').replace('latin1', 'iso-8859-1');
  try { return new TextDecoder(cs, { fatal: false }).decode(buffer); }
  catch { return new TextDecoder('utf-8', { fatal: false }).decode(buffer); }
}

function decodeQuotedPrintable(str: string): string {
  const result = str.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  const plainChars: string[] = [];
  let i = 0;
  while (i < result.length) {
    if (result[i] === '=' && /[0-9A-Fa-f]{2}/.test(result.substr(i + 1, 2))) {
      bytes.push(parseInt(result.substr(i + 1, 2), 16));
      i += 3;
    } else {
      if (bytes.length > 0) {
        plainChars.push(new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)));
        bytes.length = 0;
      }
      plainChars.push(result[i]);
      i++;
    }
  }
  if (bytes.length > 0) plainChars.push(new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)));
  return plainChars.join('');
}

function isTextLike(struct: any): boolean {
  const type = (struct.type || '').toLowerCase();
  const subtype = (struct.subtype || '').toLowerCase();
  if (type.includes('/')) return type.startsWith('text/plain') || type.startsWith('text/html');
  return type === 'text' && (subtype === 'plain' || subtype === 'html');
}

function nodeMime(struct: any): { type: string; subtype: string } {
  const rawType = (struct.type || '').toLowerCase();
  if (rawType.includes('/')) {
    const [t, s] = rawType.split('/');
    return { type: t, subtype: (s || '').toLowerCase() };
  }
  return { type: rawType, subtype: (struct.subtype || '').toLowerCase() };
}

function findTextParts(struct: any, path = ''): Array<{ type: string; path: string; size: number; encoding: string; charset: string }> {
  if (!struct) return [];
  const results: Array<{ type: string; path: string; size: number; encoding: string; charset: string }> = [];
  const children = struct.childNodes || struct.children || struct.childParts;
  if (Array.isArray(children) && children.length > 0) {
    children.forEach((child: any, idx: number) => {
      const newPath = child.part || (path ? `${path}.${idx + 1}` : String(idx + 1));
      results.push(...findTextParts(child, newPath));
    });
    return results;
  }
  const { type, subtype } = nodeMime(struct);
  const disposition = (struct.disposition || '').toLowerCase();
  if (type === 'text' && (subtype === 'plain' || subtype === 'html') && disposition !== 'attachment') {
    results.push({
      type: `${type}/${subtype}`,
      path: struct.part || path || '1',
      size: struct.size || 0,
      encoding: (struct.encoding || '7bit').toLowerCase(),
      charset: struct.parameters?.charset || struct.dispositionParameters?.charset || 'utf-8',
    });
  }
  return results;
}

function findAttachmentMeta(struct: any, path = ''): Array<{ filename: string; size: number; contentType: string; path: string; encoding?: string }> {
  if (!struct) return [];
  const results: Array<{ filename: string; size: number; contentType: string; path: string; encoding?: string }> = [];
  const children = struct.childNodes || struct.children || struct.childParts;
  if (Array.isArray(children) && children.length > 0) {
    children.forEach((child: any, idx: number) => {
      const newPath = child.part || (path ? `${path}.${idx + 1}` : String(idx + 1));
      results.push(...findAttachmentMeta(child, newPath));
    });
    return results;
  }
  const disposition = (struct.disposition || '').toLowerCase();
  const filename = struct.dispositionParameters?.filename || struct.parameters?.name;
  const { type, subtype } = nodeMime(struct);
  if (disposition === 'attachment' || (filename && !isTextLike(struct))) {
    results.push({
      filename: filename || 'unbenannt',
      size: struct.size || 0,
      contentType: `${type || 'application'}/${subtype || 'octet-stream'}`,
      path: struct.part || path || '1',
      encoding: (struct.encoding || '7bit').toLowerCase(),
    });
  }
  return results;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[shared-imap-get-message +${Date.now() - t0}ms] ${msg}`);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { accountId, folder, uid } = await req.json();
    if (!accountId || !folder || uid === undefined) return json({ ok: false, error: 'missing_params' }, 400);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return json({ ok: false, error: 'unauthorized' }, 401);

    // Verify admin role
    const { data: roleRow } = await supabaseClient
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleRow) return json({ ok: false, error: 'forbidden' }, 403);

    const { data: cachedRow } = await supabaseClient
      .from('shared_email_messages_cache').select('*')
      .eq('account_id', accountId).eq('folder', folder).eq('uid', uid).maybeSingle();

    if (cachedRow?.body_fetched_at && (cachedRow.body_text || cachedRow.body_html)) {
      log(`CACHE HIT`);
      return json({ ok: true, message: cachedRow, cached: true });
    }

    const { data: account, error: accErr } = await supabaseClient
      .from('shared_email_accounts')
      .select('id, imap_host, imap_port, imap_secure, imap_user, imap_password_encrypted')
      .eq('id', accountId).maybeSingle();
    if (accErr || !account) return json({ ok: false, error: 'Account not found' }, 404);

    const { data: decryptedPw, error: decryptErr } = await supabaseClient.rpc('decrypt_imap_password', {
      encrypted: account.imap_password_encrypted,
      encryption_key: Deno.env.get('IMAP_ENCRYPTION_KEY')!,
    });
    if (decryptErr || !decryptedPw) return json({ ok: false, error: 'decrypt_failed' }, 500);

    const client = new ImapFlow({
      host: account.imap_host, port: account.imap_port, secure: account.imap_secure,
      auth: { user: account.imap_user, pass: decryptedPw },
      logger: false, connectTimeout: 10_000, greetingTimeout: 8_000, socketTimeout: 30_000,
    });
    client.on('error', (err) => log(`IMAP err: ${err.message}`));

    let bodyText = '', bodyHtml: string | null = null, attachments: Array<any> = [], envelope: any = null;

    try {
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connect timeout')), 12_000)),
      ]);
      const lock = await Promise.race([
        client.getMailboxLock(folder),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 10_000)),
      ]) as Awaited<ReturnType<typeof client.getMailboxLock>>;

      try {
        const msg = await Promise.race([
          client.fetchOne(String(uid), { envelope: true, bodyStructure: true, flags: true, size: true }, { uid: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('BS timeout')), 20_000)),
        ]) as any;
        if (!msg) throw new Error(`UID ${uid} not found`);
        envelope = msg.envelope;

        const textParts = findTextParts(msg.bodyStructure);
        const attachmentMeta = findAttachmentMeta(msg.bodyStructure);

        if (textParts.length === 0) {
          const fallback = await Promise.race([
            client.fetchOne(String(uid), { source: true }, { uid: true }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fallback timeout')), 60_000)),
          ]) as any;
          if (fallback?.source) {
            const parsed = await simpleParser(fallback.source);
            bodyText = parsed.text || '';
            bodyHtml = typeof parsed.html === 'string' ? parsed.html : null;
            attachments = (parsed.attachments || []).map((a: any, idx: number) => ({
              attachmentId: `${uid}-${idx}`,
              filename: a.filename || `attachment-${idx}`,
              size: a.size || 0,
              contentType: a.contentType || 'application/octet-stream',
            }));
          }
        } else {
          for (const part of textParts) {
            if (part.size > 2_000_000) continue;
            try {
              const partData = await Promise.race([
                client.download(String(uid), part.path, { uid: true }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Download timeout ${part.path}`)), 25_000)),
              ]) as any;
              if (!partData?.content) continue;

              const chunks: Uint8Array[] = [];
              for await (const chunk of partData.content) {
                chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
              }
              const totalSize = chunks.reduce((acc, c) => acc + c.length, 0);
              const buffer = new Uint8Array(totalSize);
              let offset = 0;
              for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

              let decoded: string;
              const enc = part.encoding;
              if (enc === 'base64') {
                const b64str = new TextDecoder('ascii').decode(buffer).replace(/\s/g, '');
                const binaryStr = atob(b64str);
                const bytes = Uint8Array.from(binaryStr, c => c.charCodeAt(0));
                decoded = decodeWithCharset(bytes, part.charset);
              } else if (enc === 'quoted-printable') {
                const rawStr = decodeWithCharset(buffer, part.charset);
                decoded = decodeQuotedPrintable(rawStr);
              } else {
                decoded = decodeWithCharset(buffer, part.charset);
              }
              if (part.type === 'text/plain' && !bodyText) bodyText = decoded;
              else if (part.type === 'text/html' && !bodyHtml) bodyHtml = decoded;
            } catch (partErr) {
              log(`Part ${part.path} failed: ${(partErr as any)?.message}`);
            }
          }

          attachments = attachmentMeta.map((a, idx) => ({
            attachmentId: `${uid}-${idx}`,
            filename: a.filename, size: a.size, contentType: a.contentType,
            path: a.path, encoding: a.encoding,
          }));

          const htmlPartExisted = textParts.some((p) => p.type === 'text/html');
          const htmlSucceeded = !!bodyHtml && bodyHtml.length > 50;
          if (htmlPartExisted && !htmlSucceeded) {
            try {
              const fallbackMsg = await Promise.race([
                client.fetchOne(String(uid), { source: true }, { uid: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Fallback timeout')), 60_000)),
              ]) as any;
              if (fallbackMsg?.source) {
                const parsed = await simpleParser(fallbackMsg.source);
                if (typeof parsed.html === 'string' && parsed.html.length > 50) bodyHtml = parsed.html;
                if (parsed.text && parsed.text.length > (bodyText?.length ?? 0)) bodyText = parsed.text;
              }
            } catch { /* */ }
          }
        }
      } finally { lock.release(); }
    } finally {
      try {
        await Promise.race([client.logout(), new Promise((resolve) => setTimeout(resolve, 2_000))]);
      } catch { /* */ }
    }

    const cacheRow: any = {
      account_id: accountId, folder, uid,
      body_text: bodyText, body_html: bodyHtml, attachments,
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

    await supabaseClient
      .from('shared_email_messages_cache')
      .upsert(cacheRow, { onConflict: 'account_id,folder,uid' });

    const { data: finalRow } = await supabaseClient
      .from('shared_email_messages_cache').select('*')
      .eq('account_id', accountId).eq('folder', folder).eq('uid', uid).single();

    // Fire automation processor (fire-and-forget)
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-email-automations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({ accountId, uid }),
    }).catch((e) => log(`Automation trigger failed: ${e.message}`));

    return json({ ok: true, message: finalRow || cacheRow, cached: false });
  } catch (error) {
    const errMsg = (error as any)?.message || String(error);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
