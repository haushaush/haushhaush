// Background poll across all active shared accounts.
// Cron is intentionally skipped for MVP — invoke manually if needed.
import { ImapFlow } from "npm:imapflow@1.0.151";
import { corsHeaders, jsonResponse, getServiceClient, getEnv } from "../_shared/shared-imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const svc = getServiceClient();
  const { encryptionKey } = getEnv();

  const { data: accounts, error } = await svc
    .from("shared_email_accounts")
    .select("id, imap_host, imap_port, imap_secure, imap_user, imap_password_encrypted")
    .eq("is_active", true);

  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  if (!accounts || accounts.length === 0) return jsonResponse({ ok: true, polled: 0 });

  let polled = 0, newMessages = 0;

  for (const acc of accounts) {
    try {
      const { data: pwData, error: pwErr } = await svc.rpc("decrypt_imap_password", {
        encrypted: acc.imap_password_encrypted, encryption_key: encryptionKey,
      });
      if (pwErr || !pwData) continue;

      const { data: maxRow } = await svc
        .from("shared_email_messages_cache").select("uid")
        .eq("account_id", acc.id).eq("folder", "INBOX")
        .order("uid", { ascending: false }).limit(1).maybeSingle();
      const maxUid = maxRow?.uid ?? 0;

      const client = new ImapFlow({
        host: acc.imap_host, port: acc.imap_port, secure: acc.imap_secure,
        auth: { user: acc.imap_user, pass: pwData as string },
        logger: false, socketTimeout: 15000,
      });

      try {
        await client.connect();
        const lock = await client.getMailboxLock("INBOX");
        try {
          const range = `${Number(maxUid) + 1}:*`;
          const rows: any[] = [];
          for await (const msg of client.fetch(
            range,
            { envelope: true, flags: true, size: true, internalDate: true, bodyStructure: true },
            { uid: true },
          )) {
            const env = (msg as any).envelope ?? {};
            const fromArr = env.from ?? [];
            const toArr = env.to ?? [];
            const ccArr = env.cc ?? [];
            const uidNum = Number((msg as any).uid);
            if (uidNum <= maxUid) continue;
            rows.push({
              account_id: acc.id, folder: "INBOX", uid: uidNum,
              message_id: env.messageId ?? null,
              from_address: fromArr[0]?.address ?? null,
              from_name: fromArr[0]?.name ?? null,
              to_addresses: toArr.map((a: any) => a.address).filter(Boolean),
              cc_addresses: ccArr.map((a: any) => a.address).filter(Boolean),
              subject: env.subject ?? "",
              date: env.date ? new Date(env.date).toISOString()
                : ((msg as any).internalDate ? new Date((msg as any).internalDate).toISOString() : null),
              flags: Array.from((msg as any).flags ?? []),
              size_bytes: (msg as any).size ?? null,
              fetched_at: new Date().toISOString(),
            });
          }
          if (rows.length > 0) {
            await svc.from("shared_email_messages_cache").upsert(rows, { onConflict: "account_id,folder,uid" });
            newMessages += rows.length;
          }
        } finally { lock.release(); }
        await client.logout();
      } catch { try { await client.close(); } catch { /* */ } }

      await svc.from("shared_email_accounts").update({ last_polled_at: new Date().toISOString() }).eq("id", acc.id);
      polled++;
    } catch { /* continue */ }
  }

  // Fire automation processor (fire-and-forget)
  if (newMessages > 0) {
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-email-automations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify({}),
    }).catch(() => { /* */ });
  }

  return jsonResponse({ ok: true, polled, newMessages });
});
