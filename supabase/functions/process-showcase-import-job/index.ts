import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 4;

async function requeueJob(jobId: string) {
  await fetch(`${SUPABASE_URL}/functions/v1/process-showcase-import-job`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId }),
  }).catch((error) => console.error("[import-job] requeue failed", jobId, error));
}

async function processJob(jobId: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: job, error: jobErr } = await admin
    .from("showcase_import_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  if (jobErr || !job) {
    console.error("[import-job] job not found", jobId, jobErr);
    return;
  }

  if (job.status === "done") return;

  const adIds = (job.ad_ids ?? []) as string[];
  const startIndex = Math.max(0, Number(job.done ?? 0));
  const batch = adIds.slice(startIndex, startIndex + BATCH_SIZE);

  await admin
    .from("showcase_import_jobs")
    .update({ status: "processing", total: adIds.length })
    .eq("id", jobId);

  const recent: any[] = Array.isArray(job.recent) ? [...job.recent] : [];
  const errors: any[] = Array.isArray(job.errors) ? [...job.errors] : [];
  const skipped: any[] = Array.isArray(job.skipped) ? [...job.skipped] : [];
  let done = startIndex;

  const enrichment = (job.enrichment ?? {}) as Record<string, { branche?: string; unternehmen?: string }>;

  for (const adId of batch) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-ads-import-to-showcase`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          "x-internal-user-id": job.user_id,
        },
        body: JSON.stringify({ adIds: [adId] }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        errors.push({ adId, message: msg });
        recent.unshift({ adId, status: "error", message: `✗ ${adId}: ${msg}` });
      } else {
      const skip = (data?.skipped ?? []).find((s: any) => s.id === adId || s.adId === adId);
      if (skip) {
        skipped.push({ adId, reason: skip.reason || "Blacklist" });
        recent.unshift({ adId, status: "error", message: `⊘ ${adId}: ${skip.reason || "Blacklist"}` });
      } else if (data?.errors?.length) {
        const msg = data.errors[0]?.error || "Unbekannter Fehler";
        errors.push({ adId, message: msg });
        recent.unshift({ adId, status: "error", message: `✗ ${adId}: ${msg}` });
      } else {
        const enr = enrichment[adId];
        if (enr && (enr.branche || enr.unternehmen)) {
          const update: Record<string, any> = {};
          if (enr.branche) update.custom_branche = enr.branche;
          if (enr.unternehmen) update.custom_unternehmen = enr.unternehmen;
          await admin.from("referenz_meta_ads").update(update).eq("meta_ad_id", adId);
        }
        recent.unshift({ adId, status: "success", message: `✓ ${adId}` });
      }
      }
    } catch (e) {
      const msg = (e as Error).message;
      errors.push({ adId, message: msg });
      recent.unshift({ adId, status: "error", message: `✗ ${adId}: ${msg}` });
    }

    done++;
    if (recent.length > 30) recent.length = 30;

    // Persist progress every 1 ad
    await admin
      .from("showcase_import_jobs")
      .update({ done, recent, errors, skipped })
      .eq("id", jobId);
  }

  await admin
    .from("showcase_import_jobs")
    .update({ status: "done", finished_at: new Date().toISOString() })
    .eq("id", jobId);

    console.log("[import-job] finished", jobId, { done, errors: errors.length, skipped: skipped.length });
    return;
  }

  await admin
    .from("showcase_import_jobs")
    .update({ status: "processing", done, recent, errors, skipped })
    .eq("id", jobId);

  // Continue in small chunks so the edge runtime never times out on large imports.
  // @ts-ignore - EdgeRuntime is available in Supabase Edge Runtime
  EdgeRuntime.waitUntil(requeueJob(jobId));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { jobId } = await req.json();
    if (!jobId) {
      return new Response(JSON.stringify({ error: "jobId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Runtime
    EdgeRuntime.waitUntil(processJob(jobId));

    return new Response(JSON.stringify({ ok: true, jobId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[process-showcase-import-job] fatal", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
