import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ActiveRuntimeRow = {
  client_id: string; kunde: string | null; close_lead_id: string | null; close_status_label: string | null;
  close_opportunity_id: string | null; quelle: string | null; vc_opportunity_id: string | null;
  startdatum: string | null; laufzeit_monate: number | null; upsell_startdatum: string | null; upsell_laufzeit: number | null;
  vertragsende: string | null; fehlt: string[];
};
export function useActiveCloseCustomers() {
  const [rows, setRows] = useState<ActiveRuntimeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.functions.invoke('active-close-customers', { body: {} });
    if (err || data?.error) { setError(data?.error || err?.message || 'Aktive Kunden konnten nicht geladen werden.'); }
    else { setRows(data.rows || []); setError(null); }
    setLoading(false);
  }, []);
  useEffect(() => { void refetch(); }, [refetch]);
  return { rows, loading, error, refetch };
}