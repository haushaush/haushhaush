// Sync Branche & Unternehmen filter options from close_deals (Notion mirror).
// Idempotent: adds new options as is_auto_synced=true, deactivates stale auto-synced ones.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { slugifyTag } from "../_shared/showcase-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function keyForLabel(label: string): string {
  // Reuse slugifyTag logic with empty prefix to keep behavior identical.
  const slug = slugifyTag("", label).replace(/^-/, "");
  return slug || "option";
}

const COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#EF4444", "#6366F1", "#14B8A6"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  const log = (m: string) => console.log(`[sync-showcase-filters +${Date.now() - t0}ms] ${m}`);

  try {
    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: categories } = await svc
      .from("showcase_filter_categories")
      .select("*")
      .eq("is_auto_synced", true)
      .eq("is_active", true);

    if (!categories?.length) {
      return new Response(JSON.stringify({ ok: true, added: 0, deactivated: 0, message: "No auto-synced categories" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalAdded = 0;
    let totalDeactivated = 0;
    let totalReactivated = 0;

    for (const category of categories as any[]) {
      const syncField: string | null = category.synced_from_field;
      if (!syncField) continue;
      const [tableName, fieldName] = syncField.split(".");
      if (tableName !== "close_deals" || !fieldName) {
        log(`Skipping ${category.key}: only close_deals.* supported (got ${syncField})`);
        continue;
      }

      const { data: rows, error: rowErr } = await svc.from("close_deals").select(fieldName).range(0, 9999);
      log(`${category.key}: read ${rows?.length ?? 0} rows from close_deals.${fieldName}`);
      if (rowErr) {
        log(`Failed to read close_deals.${fieldName}: ${rowErr.message}`);
        continue;
      }

      // Collect unique non-empty values; supports text and text[].
      const labelByKey = new Map<string, string>();
      for (const row of (rows ?? []) as any[]) {
        const val = row[fieldName];
        if (val == null) continue;
        const items: string[] = Array.isArray(val) ? val : [String(val)];
        for (const raw of items) {
          if (raw == null) continue;
          const clean = String(raw).trim();
          if (!clean) continue;
          const k = keyForLabel(clean);
          if (!labelByKey.has(k)) labelByKey.set(k, clean);
        }
      }

      log(`${category.key}: ${labelByKey.size} unique values from ${syncField}`);

      const { data: existingOptions } = await svc
        .from("showcase_filter_options")
        .select("*")
        .eq("category_id", category.id);

      const existingByKey = new Map<string, any>(
        (existingOptions ?? []).map((o: any) => [o.key, o]),
      );

      const sortedKeys = Array.from(labelByKey.keys()).sort((a, b) =>
        labelByKey.get(a)!.localeCompare(labelByKey.get(b)!),
      );

      for (let i = 0; i < sortedKeys.length; i++) {
        const k = sortedKeys[i];
        const label = labelByKey.get(k)!;
        const existing = existingByKey.get(k);
        if (existing) {
          // Reactivate if it was previously deactivated as stale
          if (!existing.is_active) {
            await svc.from("showcase_filter_options").update({ is_active: true }).eq("id", existing.id);
            totalReactivated++;
          }
          continue;
        }
        const { error: insErr } = await svc.from("showcase_filter_options").insert({
          category_id: category.id,
          key: k,
          label,
          color_hex: COLORS[i % COLORS.length],
          display_order: i,
          is_active: true,
          is_auto_synced: true,
        });
        if (insErr) log(`Insert failed ${category.key}=${k}: ${insErr.message}`);
        else {
          totalAdded++;
          log(`Added ${category.key}=${k} ("${label}")`);
        }
      }

      // Deactivate stale auto-synced options (preserve manual ones, never delete)
      for (const opt of (existingOptions ?? []) as any[]) {
        if (!opt.is_auto_synced) continue;
        if (!labelByKey.has(opt.key) && opt.is_active) {
          await svc.from("showcase_filter_options").update({ is_active: false }).eq("id", opt.id);
          totalDeactivated++;
          log(`Deactivated stale ${category.key}=${opt.key}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        added: totalAdded,
        deactivated: totalDeactivated,
        reactivated: totalReactivated,
        duration_ms: Date.now() - t0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("sync-showcase-filters-from-notion", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
