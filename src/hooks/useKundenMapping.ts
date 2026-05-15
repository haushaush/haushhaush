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

  const accountToKunde = useMemo(() => {
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
    return map;
  }, [deals, links]);

  const matchKunde = (ad: { meta_account_id?: string }): KundeMatch | null => {
    if (!ad.meta_account_id) return null;
    const norm = String(ad.meta_account_id).replace(/^act_/, '');
    return accountToKunde.get(norm) || accountToKunde.get(`act_${norm}`) || null;
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
