// Shared helpers for IMAP edge functions
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: string, status = 400, extra?: Record<string, unknown>) {
  return jsonResponse({ ok: false, error, ...(extra ?? {}) }, status);
}

export function getEnv(): {
  supabaseUrl: string;
  serviceKey: string;
  anonKey: string;
  encryptionKey: string;
} {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const encryptionKey = Deno.env.get("IMAP_ENCRYPTION_KEY") ?? "";
  return { supabaseUrl, serviceKey, anonKey, encryptionKey };
}

export function getServiceClient(): SupabaseClient {
  const { supabaseUrl, serviceKey } = getEnv();
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getAuthedUser(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { supabaseUrl, anonKey } = getEnv();
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return { userId: data.user.id };
}

// Verify caller owns account and return decrypted password + connection info
export async function loadAccountForUser(
  userId: string,
  accountId: string,
): Promise<
  | {
      ok: true;
      account: {
        id: string;
        email_address: string;
        display_name: string | null;
        imap_host: string;
        imap_port: number;
        imap_secure: boolean;
        imap_user: string;
        smtp_host: string | null;
        smtp_port: number | null;
        smtp_secure: boolean | null;
        password: string;
      };
    }
  | { ok: false; status: number; error: string }
> {
  const svc = getServiceClient();
  const { encryptionKey } = getEnv();

  const { data: account, error } = await svc
    .from("email_accounts")
    .select(
      "id, user_id, email_address, display_name, imap_host, imap_port, imap_secure, imap_user, imap_password_encrypted, smtp_host, smtp_port, smtp_secure",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!account) return { ok: false, status: 404, error: "Account not found" };
  if (account.user_id !== userId) return { ok: false, status: 403, error: "Forbidden" };

  // Decrypt password via SQL function (service-role only)
  const { data: pwData, error: pwErr } = await svc.rpc("decrypt_imap_password", {
    encrypted: account.imap_password_encrypted,
    encryption_key: encryptionKey,
  });
  if (pwErr) return { ok: false, status: 500, error: `Decrypt failed: ${pwErr.message}` };

  return {
    ok: true,
    account: {
      id: account.id,
      email_address: account.email_address,
      display_name: account.display_name,
      imap_host: account.imap_host,
      imap_port: account.imap_port,
      imap_secure: account.imap_secure,
      imap_user: account.imap_user,
      smtp_host: account.smtp_host,
      smtp_port: account.smtp_port,
      smtp_secure: account.smtp_secure,
      password: pwData as string,
    },
  };
}

// Map IMAP errors to friendly codes
export function mapImapError(err: unknown): { code: string; message: string } {
  const e = err as { code?: string; responseStatus?: string; message?: string; authenticationFailed?: boolean };
  const message = e?.message ?? String(err);

  if (e?.authenticationFailed || /authentication failed|invalid credentials|LOGIN failed|AUTHENTICATIONFAILED/i.test(message)) {
    return { code: "auth_failed", message };
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    return { code: "connection_failed", message: "Server konnte nicht aufgelöst werden" };
  }
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|connect ETIMEDOUT/i.test(message)) {
    return { code: "connection_failed", message };
  }
  if (/SSL|TLS|wrong version number|certificate/i.test(message)) {
    return { code: "tls_error", message };
  }
  return { code: "unknown", message };
}
