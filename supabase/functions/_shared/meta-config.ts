// Shared Meta config resolver.
// Token: secret META_ACCESS_TOKEN first, fallback to integration_settings.config.access_token
// so existing setups keep working. META_BUSINESS_ID may come from env or config.business_manager_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MetaConfig {
  accessToken: string | null;
  businessId: string | null;
  source: "env" | "none";
}

let cached: MetaConfig | null = null;

export async function getMetaConfig(forceRefresh = false): Promise<MetaConfig> {
  if (cached && !forceRefresh) return cached;
  let accessToken = Deno.env.get("META_ACCESS_TOKEN")?.trim() || null;
  let businessId = Deno.env.get("META_BUSINESS_ID")?.trim() || null;
  if (!accessToken || !businessId) {
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await supabase.from("integration_settings").select("config")
        .eq("provider", "meta_ads").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const cfg = (data?.config as any) || {};
      if (!accessToken && typeof cfg.access_token === "string" && cfg.access_token.trim()) accessToken = cfg.access_token.trim();
      if (!businessId && typeof cfg.business_manager_id === "string" && cfg.business_manager_id.trim()) businessId = cfg.business_manager_id.trim();
    } catch (_) { /* optional fallback */ }
  }
  cached = { accessToken, businessId, source: accessToken ? "env" : "none" };
  return cached;
}

/** Returns the token or throws naming the missing secret. */
export async function requireMetaToken(): Promise<string> {
  const t = (await getMetaConfig()).accessToken;
  if (!t) throw new Error("Secret META_ACCESS_TOKEN fehlt");
  return t;
}

export async function getMetaToken(): Promise<string | null> {
  const t = (await getMetaConfig()).accessToken;
  if (!t) console.error("[meta-config] Secret META_ACCESS_TOKEN fehlt");
  return t;
}

export async function getMetaBusinessId(): Promise<string | null> {
  return (await getMetaConfig()).businessId;
}
