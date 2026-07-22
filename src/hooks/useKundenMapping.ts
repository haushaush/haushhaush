import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface KundeMatch {
  kunde_id: string | null;
  kundenname: string;
  branche: string;
  unternehmen: string;
  source: 'kunde_meta_accounts' | 'close_deals';
}

export function useKundenMapping() {
  const { data: deals = [] } = useQuery({
    queryKey: ['kunden-mapping-deals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('close_deals' as any)
        .select('id, client_name, branche, unternehmen, meta_ad_account_id')
        .limit(5000);
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const { data: links = [] } = useQuery({
    queryKey: ['kunden-mapping-links'],
    queryFn: async () => {
      const { data } = await supabase
        .from('kunde_meta_accounts' as any)
        .select('kunde_id, meta_account_id, meta_account_name')
        .limit(5000);
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });

  const { accountToKunde, nameToKunde } = useMemo(() => {
    const dealsById = new Map<string, any>();
    const dealsByAccount = new Map<string, any>();
    for (const d of deals) {
      if (d.id) dealsById.set(d.id, d);
      if (d.meta_ad_account_id) {
        const norm = String(d.meta_ad_account_id).replace(/^act_/, '');
        dealsByAccount.set(norm, d);
        dealsByAccount.set(`act_${norm}`, d);
      }
    }

    const map = new Map<string, KundeMatch>();
    // 1) Explicit links via kunde_meta_accounts
    for (const l of links) {
      if (!l.meta_account_id) continue;
      const deal = l.kunde_id ? dealsById.get(l.kunde_id) : null;
      const norm = String(l.meta_account_id).replace(/^act_/, '');
      const match: KundeMatch = {
        kunde_id: l.kunde_id ?? null,
        kundenname: deal?.client_name || l.meta_account_name || '',
        branche: deal?.branche || '',
        unternehmen: deal?.unternehmen || '',
        source: 'kunde_meta_accounts',
      };
      map.set(norm, match);
      map.set(`act_${norm}`, match);
    }
    // 2) Fallback: close_deals.meta_ad_account_id
    for (const [accId, deal] of dealsByAccount) {
      if (map.has(accId)) continue;
      map.set(accId, {
        kunde_id: deal.id,
        kundenname: deal.client_name || '',
        branche: deal.branche || '',
        unternehmen: deal.unternehmen || '',
        source: 'close_deals',
      });
    }

    // Name-based fallback (matches by normalized client_name)
    const nameMap = new Map<string, KundeMatch>();
    const normalizeName = (s: string) =>
      s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    for (const d of deals) {
      if (!d.client_name) continue;
      const key = normalizeName(String(d.client_name));
      if (!key || nameMap.has(key)) continue;
      nameMap.set(key, {
        kunde_id: d.id,
        kundenname: d.client_name,
        branche: d.branche || '',
        unternehmen: d.unternehmen || '',
        source: 'close_deals',
      });
    }
    return { accountToKunde: map, nameToKunde: nameMap };
  }, [deals, links]);

  const normalizeName = (s: string) =>
    s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  const matchKunde = (ad: { meta_account_id?: string; meta_account_name?: string; meta_campaign_name?: string; meta_ad_name?: string }): KundeMatch | null => {
    if (ad.meta_account_id) {
      const norm = String(ad.meta_account_id).replace(/^act_/, '');
      const byAcc = accountToKunde.get(norm) || accountToKunde.get(`act_${norm}`);
      if (byAcc) return byAcc;
    }
    // Fallback: match kunde by name appearing in account/campaign/ad name
    const haystackParts = [ad.meta_account_name, ad.meta_campaign_name, ad.meta_ad_name].filter(Boolean) as string[];
    if (!haystackParts.length) return null;
    const haystack = ' ' + normalizeName(haystackParts.join(' ')) + ' ';
    // Prefer longest name matches first to avoid partial collisions
    const candidates = Array.from(nameToKunde.entries()).sort((a, b) => b[0].length - a[0].length);
    for (const [key, match] of candidates) {
      if (key.length < 5) continue; // avoid short/ambiguous names
      if (haystack.includes(' ' + key + ' ')) return match;
    }
    return null;
  };

  return { matchKunde, accountToKunde };
}

const BRANCHE_KEYWORDS: Record<string, string> = {
  'private kranken': 'pkv',
  'krankenversicherung': 'pkv',
  pkv: 'pkv',
  'berufsunfähig': 'bu',
  'berufsunfaehig': 'bu',
  bu: 'bu',
  kfz: 'kfz',
  auto: 'kfz',
  rechtsschutz: 'rechtsschutz',
  tier: 'tierkrankenversicherung',
  hund: 'tierkrankenversicherung',
  katze: 'tierkrankenversicherung',
  'wohngebäude': 'wohngebaeudeversicherung',
  hausrat: 'hausratversicherung',
  rente: 'lebensversicherung',
  leben: 'lebensversicherung',
  photovoltaik: 'photovoltaik',
  solar: 'photovoltaik',
};

export function guessBrancheFromText(text: string = ''): string {
  const lower = text.toLowerCase();
  for (const [kw, branche] of Object.entries(BRANCHE_KEYWORDS)) {
    if (lower.includes(kw)) return branche;
  }
  return '';
}
