import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeForMatch = (s: string): string => {
  return s
    .toLowerCase()
    .trim()
    .replace(/\.(de|com|net|io|me|org|app|info)$/g, '')
    .replace(/\s+(gmbh|ag|ug|kg|ohg|se|e\.?\s?k\.?)\s*\.?$/gi, '')
    .replace(/[^a-z0-9äöüß ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const target: 'all' | 'onepage' | 'showcase' | 'campaigns' = body.target || 'all';
    const onlyUnmatched = body.only_unmatched !== false;

    const { data: clients } = await svc
      .from('clients')
      .select('id, name, meta_account_id, meta_account_ids')
      .is('deleted_at', null);

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ error: "Keine Clients vorhanden" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accountToClient = new Map<string, any>();
    const nameToClient = new Map<string, any>();

    for (const c of clients) {
      if (c.meta_account_id) {
        const raw = String(c.meta_account_id);
        const stripped = raw.replace(/^act_/, '');
        accountToClient.set(raw, c);
        accountToClient.set(stripped, c);
        accountToClient.set(`act_${stripped}`, c);
      }
      if (Array.isArray(c.meta_account_ids)) {
        for (const aid of c.meta_account_ids) {
          if (!aid) continue;
          const raw = String(aid);
          const stripped = raw.replace(/^act_/, '');
          accountToClient.set(raw, c);
          accountToClient.set(stripped, c);
          accountToClient.set(`act_${stripped}`, c);
        }
      }
      if (c.name) {
        const norm = normalizeForMatch(c.name);
        if (norm) nameToClient.set(norm, c);
      }
    }

    const matchByAccount = (accountId: string | null): any | null => {
      if (!accountId) return null;
      return accountToClient.get(String(accountId)) || null;
    };

    const matchByName = (name: string | null): any | null => {
      if (!name) return null;
      const norm = normalizeForMatch(name);
      if (!norm) return null;
      if (nameToClient.has(norm)) return nameToClient.get(norm);
      for (const [clientNorm, client] of nameToClient.entries()) {
        if (norm.includes(clientNorm) || clientNorm.includes(norm)) {
          const minLen = Math.min(norm.length, clientNorm.length);
          if (minLen >= 4) return client;
        }
      }
      return null;
    };

    const stats: any = {
      onepage: { total: 0, matched_by_name: 0, no_match: 0 },
      showcase: { total: 0, matched_by_account: 0, matched_by_name: 0, no_match: 0 },
      meta_ads: { total: 0, matched_by_account: 0, matched_by_name: 0, no_match: 0 },
      campaigns: { total: 0, matched_by_account: 0, matched_by_name: 0, no_match: 0 },
      projects: { total: 0, matched_by_name: 0, no_match: 0 },
    };

    if (target === 'all' || target === 'onepage') {
      let q = svc.from('onepage_projects').select('id, name, client_id_fk');
      if (onlyUnmatched) q = q.is('client_id_fk', null);
      const { data: rows } = await q;
      stats.onepage.total = rows?.length || 0;
      for (const r of rows || []) {
        const client = matchByName(r.name);
        if (client) {
          await svc.from('onepage_projects').update({ client_id_fk: client.id }).eq('id', r.id);
          stats.onepage.matched_by_name++;
        } else {
          stats.onepage.no_match++;
        }
      }
    }

    if (target === 'all' || target === 'showcase') {
      let q = svc.from('referenz_showcase').select('id, title, client_name, meta_account_id, linked_client_id').is('deleted_at', null);
      if (onlyUnmatched) q = q.is('linked_client_id', null);
      const { data: rows } = await q;
      stats.showcase.total = rows?.length || 0;
      for (const r of rows || []) {
        let client = matchByAccount(r.meta_account_id);
        let method = 'auto_account';
        if (!client) {
          client = matchByName(r.client_name) || matchByName(r.title);
          method = 'auto_name';
        }
        if (client) {
          await svc.from('referenz_showcase').update({ linked_client_id: client.id }).eq('id', r.id);
          if (method === 'auto_account') stats.showcase.matched_by_account++;
          else stats.showcase.matched_by_name++;
        } else {
          stats.showcase.no_match++;
        }
      }
    }

    if (target === 'all' || target === 'meta_ads') {
      let q = svc.from('referenz_meta_ads').select(
        'id, meta_account_id, meta_account_name, meta_ad_name, meta_campaign_name, meta_adset_name, linked_client_id'
      ).is('deleted_at', null);
      if (onlyUnmatched) q = q.is('linked_client_id', null);
      const { data: rows } = await q;
      stats.meta_ads.total = rows?.length || 0;
      for (const r of rows || []) {
        let client = matchByAccount(r.meta_account_id);
        let method = 'auto_account';
        if (!client) {
          client = matchByName(r.meta_account_name)
                || matchByName(r.meta_campaign_name)
                || matchByName(r.meta_adset_name)
                || matchByName(r.meta_ad_name);
          method = 'auto_name';
        }
        if (client) {
          await svc.from('referenz_meta_ads').update({ linked_client_id: client.id }).eq('id', r.id);
          if (method === 'auto_account') stats.meta_ads.matched_by_account++;
          else stats.meta_ads.matched_by_name++;
        } else {
          stats.meta_ads.no_match++;
        }
      }
    }

    if (target === 'all' || target === 'campaigns') {
      let q = svc.from('referenz_meta_campaigns').select(
        'id, meta_account_id, meta_account_name, meta_campaign_name, linked_client_id'
      );
      if (onlyUnmatched) q = q.is('linked_client_id', null);
      const { data: rows } = await q;
      stats.campaigns.total = rows?.length || 0;
      for (const r of rows || []) {
        let client = matchByAccount(r.meta_account_id);
        let method = 'auto_account';
        if (!client) {
          client = matchByName(r.meta_account_name) || matchByName(r.meta_campaign_name);
          method = 'auto_name';
        }
        if (client) {
          await svc.from('referenz_meta_campaigns').update({ linked_client_id: client.id }).eq('id', r.id);
          if (method === 'auto_account') stats.campaigns.matched_by_account++;
          else stats.campaigns.matched_by_name++;
        } else {
          stats.campaigns.no_match++;
        }
      }
    }

    if (target === 'all' || target === 'projects') {
      let q = svc.from('projects').select('id, name, client_id');
      if (onlyUnmatched) q = q.is('client_id', null);
      const { data: rows } = await q;
      stats.projects.total = rows?.length || 0;
      for (const r of rows || []) {
        const client = matchByName(r.name);
        if (client) {
          await svc.from('projects').update({ client_id: client.id }).eq('id', r.id);
          stats.projects.matched_by_name++;
        } else {
          stats.projects.no_match++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
