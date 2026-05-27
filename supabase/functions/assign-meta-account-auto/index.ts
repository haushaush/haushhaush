import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const NAME_COLUMN_ID = "Col0B5BLYQH7B";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+(gmbh|ag|kg|ohg|mbh|se|ug)\.?$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) || 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let totalA = 0;
  let totalB = 0;
  for (const v of A.values()) totalA += v;
  for (const v of B.values()) totalB += v;
  for (const [g, ca] of A) {
    const cb = B.get(g);
    if (cb) inter += Math.min(ca, cb);
  }
  return (2 * inter) / (totalA + totalB);
}

function getFieldText(fields: any, columnId: string): string | null {
  if (!fields) return null;
  const f = fields[columnId];
  if (f == null) return null;
  if (typeof f === "string") return f;
  if (typeof f === "object") {
    if (typeof f.text === "string" && f.text.trim()) return f.text;
    if (Array.isArray(f.select) && f.select.length > 0) return String(f.select[0]);
    if (typeof f.value === "string") return f.value;
  }
  return null;
}

serve(async (req) => {
  // PREFLIGHT must be checked FIRST
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const force: boolean = !!body?.force;

    const [{ data: items }, { data: assignments }, { data: clients }, { data: cache }] =
      await Promise.all([
        supabase.from("slack_list_items").select("slack_item_id, slack_list_id, fields"),
        supabase.from("slack_item_meta_account").select("*"),
        supabase
          .from("clients")
          .select("id, name, meta_account_id")
          .not("meta_account_id", "is", null),
        supabase.from("meta_accounts_cache").select("meta_account_id, name"),
      ]);

    const cacheMap = new Map<string, string>();
    for (const c of cache || []) cacheMap.set(c.meta_account_id, c.name || c.meta_account_id);

    const assignMap = new Map<string, any>();
    for (const a of assignments || []) assignMap.set(a.slack_item_id, a);

    const normClients = (clients || []).map((c: any) => ({
      ...c,
      _norm: normalize(c.name || ""),
    }));

    let matched = 0;
    let skipped = 0;
    const total = (items || []).length;

    for (const item of items || []) {
      const existing = assignMap.get(item.slack_item_id);
      if (existing && existing.source === "manual") { skipped++; continue; }
      if (existing && !force) { skipped++; continue; }

      const slackName = getFieldText(item.fields, NAME_COLUMN_ID);
      if (!slackName || slackName.trim().length < 2) { skipped++; continue; }
      const normSlack = normalize(slackName);
      if (!normSlack) { skipped++; continue; }

      // 1) exact match
      let hit = normClients.find((c) => c._norm === normSlack);
      let conf = hit ? 1 : 0;

      // 2) fuzzy
      if (!hit) {
        let best: any = null;
        let bestScore = 0;
        for (const c of normClients) {
          if (!c._norm) continue;
          const s = similarity(normSlack, c._norm);
          if (s > bestScore) { bestScore = s; best = c; }
        }
        if (best && bestScore >= 0.85) {
          hit = best;
          conf = bestScore;
        }
      }

      if (!hit) {
        console.log("[auto-match][skip]", { slack_name: slackName });
        skipped++;
        continue;
      }

      const accId: string = hit.meta_account_id;
      const accName = cacheMap.get(accId) || cacheMap.get(`act_${accId}`) || null;
      const normalizedAccId = accId.startsWith("act_") ? accId : `act_${accId}`;

      const { error: upErr } = await supabase
        .from("slack_item_meta_account")
        .upsert(
          {
            slack_item_id: item.slack_item_id,
            slack_list_id: item.slack_list_id,
            meta_account_id: normalizedAccId,
            meta_account_name: accName,
            source: "auto",
            matched_client_id: hit.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "slack_item_id" },
        );
      if (upErr) {
        console.error("[auto-match][upsert error]", upErr);
        skipped++;
        continue;
      }
      console.log("[auto-match]", {
        slack_name: slackName,
        matched_client: hit.name,
        account: normalizedAccId,
        confidence: conf,
      });
      matched++;
    }

    return new Response(
      JSON.stringify({ matched, skipped, total }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('[assign-meta-account-auto]', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
