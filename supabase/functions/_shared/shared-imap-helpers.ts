// Shared helpers for SHARED IMAP edge functions (admin-managed org-wide mailboxes).
// Mirrors imap-helpers.ts but reads/writes shared_email_accounts + shared_email_messages_cache,
// and authorizes by `admin` app_role instead of per-user ownership.
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

export function getEnv() {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    encryptionKey: Deno.env.get("IMAP_ENCRYPTION_KEY") ?? "",
  };
}

export function getServiceClient(): SupabaseClient {
  const { supabaseUrl, serviceKey } = getEnv();
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify the caller is authenticated AND has `admin` app_role.
export async function getAdminUser(req: Request): Promise<{ userId: string } | null> {
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

  const svc = getServiceClient();
  const { data: roleRow } = await svc
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!roleRow) return null;
  return { userId: data.user.id };
}

// Load a shared account; only admins may call this (caller must verify).
export async function loadSharedAccount(accountId: string): Promise<
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
    .from("shared_email_accounts")
    .select(
      "id, email_address, display_name, imap_host, imap_port, imap_secure, imap_user, imap_password_encrypted, smtp_host, smtp_port, smtp_secure",
    )
    .eq("id", accountId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!account) return { ok: false, status: 404, error: "Shared account not found" };

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

const accountLocks = new Map<string, Promise<void>>();

export async function withAccountLock<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
  while (accountLocks.has(accountId)) {
    try { await accountLocks.get(accountId); } catch { /* ignore */ }
  }
  let release!: () => void;
  const lockPromise = new Promise<void>((resolve) => { release = resolve; });
  accountLocks.set(accountId, lockPromise);
  try {
    return await fn();
  } finally {
    accountLocks.delete(accountId);
    release();
  }
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms) as unknown as number;
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const IMAP_TIMEOUTS = {
  connectTimeout: 15_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

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
