import nodemailer from "npm:nodemailer@6.9.7";
import {
  corsHeaders, jsonResponse, errorResponse, getAdminUser, loadSharedAccount, withTimeout,
} from "../_shared/shared-imap-helpers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await getAdminUser(req);
  if (!auth) return errorResponse("Forbidden — admin role required", 403);

  let body: any;
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const { accountId, to, cc, bcc, subject, text, html, replyTo, attachments } = body ?? {};
  if (!accountId || !to || !subject || (!text && !html)) {
    return errorResponse("Missing required fields", 400);
  }

  const result = await loadSharedAccount(accountId);
  if (!result.ok) return errorResponse(result.error, result.status);
  const acc = result.account;

  if (!acc.smtp_host || !acc.smtp_port) {
    return errorResponse("SMTP not configured for this account", 400);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: acc.smtp_host, port: acc.smtp_port, secure: acc.smtp_secure ?? true,
      auth: { user: acc.imap_user, pass: acc.password },
      connectionTimeout: 20000, greetingTimeout: 10000, socketTimeout: 30000,
    });

    const fromName = acc.display_name ?? acc.email_address;
    const info = await withTimeout(
      transporter.sendMail({
        from: `"${fromName}" <${acc.email_address}>`,
        to: Array.isArray(to) ? to.join(", ") : to,
        cc: cc ? (Array.isArray(cc) ? cc.join(", ") : cc) : undefined,
        bcc: bcc ? (Array.isArray(bcc) ? bcc.join(", ") : bcc) : undefined,
        subject, text: text ?? undefined, html: html ?? undefined,
        replyTo: replyTo ?? undefined, attachments: attachments ?? undefined,
      }),
      60_000, "smtp-send",
    );
    return jsonResponse({ ok: true, messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    let code = "send_failed";
    if (/auth|535|credentials/i.test(message)) code = "auth_failed";
    if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(message)) code = "connection_failed";
    return jsonResponse({ ok: false, error: code, message }, 200);
  }
});
