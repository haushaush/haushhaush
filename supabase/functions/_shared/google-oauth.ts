// Google OAuth client credentials: secrets first, fallback to integration_settings.config
// (provider 'google_drive', keys client_id / client_secret) so existing setups keep working.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let cached: { clientId: string; clientSecret: string } | null = null;

async function loadCreds(): Promise<{ clientId: string; clientSecret: string }> {
  if (cached) return cached;
  let clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")?.trim() || "";
  let clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")?.trim() || "";
  if (!clientId || !clientSecret) {
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await supabase.from("integration_settings").select("config")
        .eq("provider", "google_drive").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const cfg = (data?.config as any) || {};
      if (!clientId && typeof cfg.client_id === "string") clientId = cfg.client_id.trim();
      if (!clientSecret && typeof cfg.client_secret === "string") clientSecret = cfg.client_secret.trim();
    } catch (_) { /* fall through to error below */ }
  }
  if (!clientId) throw new Error("Secret GOOGLE_OAUTH_CLIENT_ID fehlt");
  if (!clientSecret) throw new Error("Secret GOOGLE_OAUTH_CLIENT_SECRET fehlt");
  cached = { clientId, clientSecret };
  return cached;
}

export async function googleOAuthCreds(): Promise<{ clientId: string; clientSecret: string }> {
  return loadCreds();
}

export async function googleOAuthClientId(): Promise<string> {
  return (await loadCreds()).clientId;
}
