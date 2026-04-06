import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ARIAData {
  activeDealsCount: number;
  redAmpelCount: number;
  redAmpelClients: string;
  openInvoicesCount: number;
  openInvoicesTotal: number;
  overdueInvoicesCount: number;
  overdueInvoicesTotal: number;
  openTasksCount: number;
  overdueTasksCount: number;
  mrr: number;
  thisWeekCalls: number;
  thisWeekCloses: number;
  thisWeekRevenue: number;
  allClients: { id: string; name: string; wert: number | null; art: string | null; ampel: string | null }[];
  allTasks: { id: string; title: string; due: string | null; overdue: boolean }[];
  invoicesList: { nr: string; betrag: number | null; status: string | null; faellig: string | null }[];
}

export function useARIAData(): ARIAData | null {
  const [data, setData] = useState<ARIAData | null>(null);

  useEffect(() => {
    const fetchAll = async () => {
      const [
        { data: deals },
        { data: invoices },
        { data: tasks },
        { data: salesPerf },
        { data: recurring },
      ] = await Promise.all([
        supabase.from('close_deals').select('id,client_name,wert_eur,status,ampelstatus,art,start_datum,leistungen,assigned_to'),
        supabase.from('invoices').select('id,invoice_nr,client_name,status,brutto,faelligkeitsdatum'),
        supabase.from('tasks').select('id,title,status,assignee_id,due_date'),
        supabase.from('sales_performance').select('setter_id,datum,calls_made,appointments_set,show_ups,closes,revenue_generated').order('datum', { ascending: false }).limit(50),
        supabase.from('recurring_revenues').select('client_name,monthly_amount,is_active').eq('is_active', true),
      ]);

      const now = new Date();
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      thisMonday.setHours(0, 0, 0, 0);

      const activeDeals = deals?.filter(d => d.status === 'Aktiv') || [];
      const openInvoices = invoices?.filter(i => i.status && ['Versendet', 'Überfällig'].includes(i.status)) || [];
      const overdueInvoices = invoices?.filter(i => i.status === 'Überfällig') || [];
      const openTasks = tasks?.filter(t => t.status === 'Offen') || [];
      const overdueTasks = openTasks.filter(t => t.due_date && new Date(t.due_date) < now);
      const mrr = recurring?.reduce((sum, r) => sum + (r.monthly_amount || 0), 0) || 0;
      const openInvoicesTotal = openInvoices.reduce((sum, i) => sum + (i.brutto || 0), 0);
      const overdueInvoicesTotal = overdueInvoices.reduce((sum, i) => sum + (i.brutto || 0), 0);
      const thisWeekSales = salesPerf?.filter(s => new Date(s.datum) >= thisMonday) || [];
      const redAmpel = activeDeals.filter(d => d.ampelstatus === 'Rot');

      setData({
        activeDealsCount: activeDeals.length,
        redAmpelCount: redAmpel.length,
        redAmpelClients: redAmpel.map(d => d.client_name).join(', '),
        openInvoicesCount: openInvoices.length,
        openInvoicesTotal,
        overdueInvoicesCount: overdueInvoices.length,
        overdueInvoicesTotal,
        openTasksCount: openTasks.length,
        overdueTasksCount: overdueTasks.length,
        mrr,
        thisWeekCalls: thisWeekSales.reduce((s, r) => s + (r.calls_made || 0), 0),
        thisWeekCloses: thisWeekSales.reduce((s, r) => s + (r.closes || 0), 0),
        thisWeekRevenue: thisWeekSales.reduce((s, r) => s + (r.revenue_generated || 0), 0),
        allClients: activeDeals.map(d => ({
          id: d.id,
          name: d.client_name,
          wert: d.wert_eur,
          art: d.art,
          ampel: d.ampelstatus,
        })),
        allTasks: openTasks.slice(0, 15).map(t => ({
          id: t.id,
          title: t.title,
          due: t.due_date,
          overdue: !!t.due_date && new Date(t.due_date) < now,
        })),
        invoicesList: openInvoices.slice(0, 10).map(i => ({
          nr: i.invoice_nr,
          betrag: i.brutto,
          status: i.status,
          faellig: i.faelligkeitsdatum,
        })),
      });
    };

    fetchAll();
    const interval = setInterval(fetchAll, 120_000);
    return () => clearInterval(interval);
  }, []);

  return data;
}
