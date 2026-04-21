import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MetaAdAccount {
  id: string; // act_xxxx or xxxx
  account_id?: string;
  name: string;
  account_status?: number;
  currency?: string;
  amount_spent?: string;
  spend_cap?: string;
  balance?: string;
  owned?: boolean;
}

export type DatePreset = 'last_7d' | 'last_14d' | 'last_30d' | 'maximum';

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'last_7d', label: 'Letzte 7 Tage' },
  { value: 'last_14d', label: 'Letzte 14 Tage' },
  { value: 'last_30d', label: 'Letzte 30 Tage' },
  { value: 'maximum', label: 'Gesamt' },
];

interface MetaAdsContextValue {
  accounts: MetaAdAccount[];
  loadingAccounts: boolean;
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;
  datePreset: DatePreset;
  setDatePreset: (p: DatePreset) => void;
  refreshAccounts: () => Promise<void>;
  callMeta: <T = any>(endpoint: string, params?: Record<string, any>, method?: string) => Promise<T>;
  error: string | null;
}

const MetaAdsContext = createContext<MetaAdsContextValue | null>(null);

export function MetaAdsProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(
    () => localStorage.getItem('meta-selected-account') || null
  );
  const [datePreset, setDatePresetState] = useState<DatePreset>(
    () => (localStorage.getItem('meta-date-preset') as DatePreset) || 'last_30d'
  );
  const [error, setError] = useState<string | null>(null);

  const setSelectedAccountId = (id: string | null) => {
    setSelectedAccountIdState(id);
    if (id) localStorage.setItem('meta-selected-account', id);
    else localStorage.removeItem('meta-selected-account');
  };

  const setDatePreset = (p: DatePreset) => {
    setDatePresetState(p);
    localStorage.setItem('meta-date-preset', p);
  };

  const callMeta = useCallback(async <T = any,>(endpoint: string, params?: Record<string, any>, method?: string): Promise<T> => {
    const { data, error: invokeErr } = await supabase.functions.invoke('meta-proxy', {
      body: { endpoint, params, method },
    });
    if (invokeErr) throw new Error(invokeErr.message);
    if (data?.error) {
      const msg = typeof data.error === 'string' ? data.error : data.error.message || 'Meta API error';
      throw new Error(msg);
    }
    return data as T;
  }, []);

  const refreshAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setError(null);
    try {
      const fields = 'id,account_id,name,account_status,currency,amount_spent,spend_cap,balance';
      const [owned, client] = await Promise.all([
        callMeta<any>('/{business_id}/owned_ad_accounts', { fields, limit: 200 }).catch((e) => ({ error: e })),
        callMeta<any>('/{business_id}/client_ad_accounts', { fields, limit: 200 }).catch((e) => ({ error: e })),
      ]);

      const ownedList: MetaAdAccount[] = (owned?.data || []).map((a: any) => ({ ...a, owned: true }));
      const clientList: MetaAdAccount[] = (client?.data || []).map((a: any) => ({ ...a, owned: false }));
      const merged = [...ownedList, ...clientList];

      // Dedupe by id
      const map = new Map<string, MetaAdAccount>();
      merged.forEach((a) => map.set(a.id, a));
      const list = Array.from(map.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      setAccounts(list);
      if (!selectedAccountId && list.length > 0) {
        setSelectedAccountId(list[0].id);
      }
      if (owned?.error && client?.error) {
        setError(owned.error.message || 'Konnte Werbekonten nicht laden');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingAccounts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMeta]);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  return (
    <MetaAdsContext.Provider
      value={{
        accounts,
        loadingAccounts,
        selectedAccountId,
        setSelectedAccountId,
        datePreset,
        setDatePreset,
        refreshAccounts,
        callMeta,
        error,
      }}
    >
      {children}
    </MetaAdsContext.Provider>
  );
}

export function useMetaAds() {
  const ctx = useContext(MetaAdsContext);
  if (!ctx) throw new Error('useMetaAds must be used within MetaAdsProvider');
  return ctx;
}
