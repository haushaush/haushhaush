// Shared Meta config resolver.
// Priority: connected integration_settings row (provider 'meta_ads') -> env secrets.
// This lets the whole app use the access token configured in the Integrations UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MetaConfig {
  accessToken: string | null;
  businessId: string | null;
  source: "integration_settings" | "env" | "none";
}

let cached: MetaConfig | null = null;

export async function getMetaConfig(forceRefresh = false): Promise<MetaConfig> {
  if (cached && !forceRefresh) return cached;

  const envToken = Deno.env.get("META_ACCESS_TOKEN") ?? null;
  const envBusiness = Deno.env.get("META_BUSINESS_ID") ?? null;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await supabase
      .from("integration_settings")
      .select("config, connected")
      .eq("provider", "meta_ads")
      .eq("connected", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const cfg = (data?.config ?? {}) as Record<string, any>;
    const dbToken = typeof cfg.access_token === "string" && cfg.access_token.trim()
      ? cfg.access_token.trim()
      : null;
    const dbBusiness =
      typeof cfg.business_manager_id === "string" && cfg.business_manager_id.trim()
        ? cfg.business_manager_id.trim()
        : null;

    if (dbToken) {
      cached = {
        accessToken: dbToken,
        businessId: dbBusiness ?? envBusiness,
        source: "integration_settings",
      };
      return cached;
    }
  } catch (e) {
    console.error("[meta-config] integration_settings lookup failed, falling back to env", e);
  }

  cached = {
    accessToken: envToken,
    businessId: envBusiness,
    source: envToken ? "env" : "none",
  };
  return cached;
}

export async function getMetaToken(): Promise<string | null> {
  return (await getMetaConfig()).accessToken;
}

export async function getMetaBusinessId(): Promise<string | null> {
  return (await getMetaConfig()).businessId;
}
