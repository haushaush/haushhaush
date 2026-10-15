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
  const envToken = Deno.env.get("META_ACCESS_TOKEN")?.trim() || null;
  let businessId = Deno.env.get("META_BUSINESS_ID")?.trim() || null;
  if (!businessId) {
    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data } = await supabase.from("integration_settings").select("config")
        .eq("provider", "meta_ads").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const b = (data?.config as any)?.business_manager_id;
      if (typeof b === "string" && b.trim()) businessId = b.trim();
    } catch (_) { /* non-secret, optional */ }
  }
  cached = { accessToken: envToken, businessId, source: envToken ? "env" : "none" };
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
