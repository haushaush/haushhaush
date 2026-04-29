// Shared helpers for Pipedrive edge functions.
// IMPORTANT: project rule — set CORS headers manually, do not import from supabase-js.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function cleanDomain(input: string): string {
  return String(input)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.pipedrive\.com.*$/i, "")
    .replace(/\/$/, "");
}

export function getEnv() {
  return {
    supabaseUrl: Deno.env.get("SUPABASE_URL")!,
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    encryptionKey: Deno.env.get("IMAP_ENCRYPTION_KEY") ?? "",
  };
}

export function svcClient(): SupabaseClient {
  const { supabaseUrl, serviceKey } = getEnv();
  return createClient(supabaseUrl, serviceKey);
}

export async function requireAdmin(req: Request): Promise<
  | { ok: true; userId: string; userClient: SupabaseClient; svc: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, response: jsonResponse({ ok: false, error: "unauthorized" }, 401) };
  }
  const { supabaseUrl, serviceKey } = getEnv();
  const userClient = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const svc = createClient(supabaseUrl, serviceKey);

  const { data: userRes } = await userClient.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return { ok: false, response: jsonResponse({ ok: false, error: "unauthorized" }, 401) };
  }
  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (!isAdmin) {
    return { ok: false, response: jsonResponse({ ok: false, error: "forbidden" }, 403) };
  }
  return { ok: true, userId: user.id, userClient, svc };
}

export async function pipedriveTestCredentials(domain: string, apiToken: string) {
  const dom = cleanDomain(domain);
  const url = `https://${dom}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(apiToken)}`;
  const res = await fetch(url);
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { ok: res.ok && !!data?.success, status: res.status, data, cleanedDomain: dom };
}

export async function decryptToken(svc: SupabaseClient, encrypted: string): Promise<string> {
  const { encryptionKey } = getEnv();
  const { data, error } = await svc.rpc("decrypt_imap_password", {
    encrypted,
    encryption_key: encryptionKey,
  });
  if (error) throw new Error(`decrypt failed: ${error.message}`);
  return data as string;
}

export async function encryptToken(svc: SupabaseClient, token: string): Promise<string> {
  const { encryptionKey } = getEnv();
  const { data, error } = await svc.rpc("encrypt_imap_password", {
    password: token,
    encryption_key: encryptionKey,
  });
  if (error) throw new Error(`encrypt failed: ${error.message}`);
  return data as string;
}

// Paginated GET against Pipedrive v1 with start/limit cursor.
export async function pipedriveFetchAll<T = any>(
  domain: string,
  apiToken: string,
  path: string,
  extraQs: Record<string, string> = {},
  pageLimit = 100,
  maxPages = 50,
): Promise<T[]> {
  const dom = cleanDomain(domain);
  const out: T[] = [];
  let start = 0;
  for (let i = 0; i < maxPages; i++) {
    const qs = new URLSearchParams({
      api_token: apiToken,
      start: String(start),
      limit: String(pageLimit),
      ...extraQs,
    });
    const url = `https://${dom}.pipedrive.com/api/v1/${path}?${qs.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`pipedrive ${path} ${res.status}`);
    const json: any = await res.json();
    if (!json?.success) throw new Error(`pipedrive ${path} not successful: ${json?.error || "unknown"}`);
    const items: T[] = json.data ?? [];
    out.push(...items);
    const more = json?.additional_data?.pagination?.more_items_in_collection;
    const next = json?.additional_data?.pagination?.next_start;
    if (!more || typeof next !== "number") break;
    start = next;
  }
  return out;
}
