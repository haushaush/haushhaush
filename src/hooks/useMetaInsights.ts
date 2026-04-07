import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface MetaInsightRow {
  id: string;
  ad_account_id: string;
  ad_account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  date_start: string;
  date_stop: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
  cpm: number;
  reach: number;
  synced_at: string;
  created_at: string;
}

interface MetaFilters {
  adAccountId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useMetaInsights(filters: MetaFilters = {}) {
  const [data, setData] = useState<MetaInsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('meta_insights')
      .select('*')
      .order('date_start', { ascending: false });

    if (filters.adAccountId) {
      query = query.eq('ad_account_id', filters.adAccountId);
    }
    if (filters.dateFrom) {
      query = query.gte('date_start', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('date_start', filters.dateTo);
    }

    const { data: rows, error } = await query.limit(1000);
    if (!error && rows) setData(rows as unknown as MetaInsightRow[]);
    setLoading(false);
  }, [filters.adAccountId, filters.dateFrom, filters.dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sync = useCallback(async (datePreset = 'last_30d') => {
    setSyncing(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('sync-meta', {
        body: { date_preset: datePreset },
      });
      if (error) throw error;
      await fetchData();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  // Aggregations
  const totals = useMemo(() => {
    const totalSpend = data.reduce((s, r) => s + Number(r.spend || 0), 0);
    const totalLeads = data.reduce((s, r) => s + (r.leads || 0), 0);
    const totalClicks = data.reduce((s, r) => s + (r.clicks || 0), 0);
    const totalImpressions = data.reduce((s, r) => s + (r.impressions || 0), 0);
    const totalReach = data.reduce((s, r) => s + (r.reach || 0), 0);
    return {
      spend: totalSpend,
      leads: totalLeads,
      cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
      ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
      reach: totalReach,
      impressions: totalImpressions,
      clicks: totalClicks,
    };
  }, [data]);

  // Group by campaign
  const byCampaign = useMemo(() => {
    const map = new Map<string, { name: string; spend: number; leads: number; clicks: number; impressions: number; cpl: number; ctr: number }>();
    data.forEach(r => {
      const key = r.campaign_id || 'unknown';
      const prev = map.get(key) || { name: r.campaign_name || '–', spend: 0, leads: 0, clicks: 0, impressions: 0, cpl: 0, ctr: 0 };
      prev.spend += Number(r.spend || 0);
      prev.leads += (r.leads || 0);
      prev.clicks += (r.clicks || 0);
      prev.impressions += (r.impressions || 0);
      map.set(key, prev);
    });
    return Array.from(map.entries()).map(([id, d]) => ({
      id,
      ...d,
      cpl: d.leads > 0 ? d.spend / d.leads : 0,
      ctr: d.impressions > 0 ? (d.clicks / d.impressions) * 100 : 0,
    })).sort((a, b) => b.spend - a.spend);
  }, [data]);

  // Group by date for charts
  const byDate = useMemo(() => {
    const map = new Map<string, { spend: number; leads: number }>();
    data.forEach(r => {
      const prev = map.get(r.date_start) || { spend: 0, leads: 0 };
      prev.spend += Number(r.spend || 0);
      prev.leads += (r.leads || 0);
      map.set(r.date_start, prev);
    });
    return Array.from(map.entries())
      .map(([date, d]) => ({ datum: date, Spend: Math.round(d.spend * 100) / 100, Leads: d.leads }))
      .sort((a, b) => a.datum.localeCompare(b.datum));
  }, [data]);

  const lastSyncedAt = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((latest, r) => {
      if (!latest || r.synced_at > latest) return r.synced_at;
      return latest;
    }, '' as string);
  }, [data]);

  return { data, loading, syncing, refetch: fetchData, sync, totals, byCampaign, byDate, lastSyncedAt };
}
