// Listet ALLE für den Business-Manager verfügbaren Meta-Werbekonten
// (owned + client_ad_accounts) — nicht nur die schon in unserer DB sind.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

import { getMetaConfig } from "../_shared/meta-config.ts";

const API_VERSION = 'v19.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  status: 'active' | 'inactive';
  currency?: string;
  timezone?: string;
  is_client_account?: boolean;
}

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function fetchAccounts(path: string, isClient: boolean, token: string): Promise<AdAccount[]> {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('fields', 'id,account_id,name,account_status,currency,timezone_name');
  url.searchParams.set('limit', '500');
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Meta API error (${res.status})`);
  return (data.data ?? []).map((acc: any) => ({
    id: acc.id,
    account_id: acc.account_id ?? String(acc.id).replace(/^act_/, ''),
    name: acc.name ?? acc.id,
    status: acc.account_status === 1 ? 'active' : 'inactive',
    currency: acc.currency,
    timezone: acc.timezone_name,
    is_client_account: isClient,
  }));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { accessToken: ACCESS_TOKEN, businessId: BUSINESS_ID } = await getMetaConfig();
    if (!ACCESS_TOKEN) return jsonError('Meta Access Token nicht konfiguriert (Integrationen → Meta Ads)', 500);

    const accounts: AdAccount[] = [];

    if (BUSINESS_ID) {
      const owned = await fetchAccounts(`/${BUSINESS_ID}/owned_ad_accounts`, false, ACCESS_TOKEN);
      accounts.push(...owned);
      try {
        const client = await fetchAccounts(`/${BUSINESS_ID}/client_ad_accounts`, true, ACCESS_TOKEN);
        for (const c of client) {
          if (!accounts.some(a => a.account_id === c.account_id)) accounts.push(c);
        }
      } catch (_e) {
        // Client-Liste kann je nach Permissions fehlen — ignorieren
      }
    } else {
      const me = await fetchAccounts('/me/adaccounts', false, ACCESS_TOKEN);
      accounts.push(...me);
    }

    accounts.sort((a, b) => a.name.localeCompare(b.name, 'de'));

    return new Response(JSON.stringify({ accounts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('list-meta-ad-accounts error', e);
    return jsonError(e?.message ?? 'Unbekannter Fehler', 500);
  }
});
