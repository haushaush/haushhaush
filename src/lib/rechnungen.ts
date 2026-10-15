import { supabase } from '@/integrations/supabase/client';

/**
 * Einzige Stelle, die Rechnungen aus Qonto und lexoffice vereinheitlicht (Felder + Status).
 * Alle Finanzen-Tabs (Übersicht, Lexware, Qonto-Liste, Rechnungen) nutzen diese Funktionen.
 */
export type Quelle = 'qonto' | 'lexoffice';
export type StatusKey = 'offen' | 'überfällig' | 'bezahlt' | 'storniert' | 'sonstige';

export const QUELLE_LABEL: Record<Quelle, string> = { qonto: 'Qonto', lexoffice: 'Lexware' };
export const STATUS_LABEL: Record<Exclude<StatusKey, 'sonstige'>, string> = {
  offen: 'Offen', 'überfällig': 'Überfällig', bezahlt: 'Bezahlt', storniert: 'Storniert',
};

const BEKANNT: Record<Quelle, Record<string, StatusKey>> = {
  qonto: { unpaid: 'offen', paid: 'bezahlt', canceled: 'storniert' },
  lexoffice: { open: 'offen', overdue: 'überfällig', paid: 'bezahlt', paidoff: 'bezahlt', voided: 'storniert' },
};

/** Quellstatus → gemeinsamer Status. Offene Rechnungen mit vergangener Fälligkeit gelten als überfällig. Unbekannte Werte → 'sonstige'. */
export function rechnungsStatus(quelle: Quelle, raw: string | null | undefined, due: string | null | undefined, heute: string): StatusKey {
  const k = BEKANNT[quelle][String(raw ?? '')];
  if (!k) return 'sonstige';
  if (k === 'offen' && due && due < heute) return 'überfällig';
  return k;
}

/** Anzeigetext: bekannter Status übersetzt, unbekannter Quellwert unverändert. */
export const statusText = (r: { status: StatusKey; rawStatus: string | null }) =>
  r.status === 'sonstige' ? (r.rawStatus || '–') : STATUS_LABEL[r.status];

export type Rechnung = {
  id: string; quelle: Quelle; number: string | null; kunde: string | null; email: string | null;
  amount: number; currency: string | null; issue: string | null; due: string | null; paid: string | null;
  url: string | null; rawStatus: string | null; status: StatusKey; updated: string | null;
};

async function alle(table: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table as any).select('*').range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function ladeRechnungen(quelle: Quelle): Promise<Rechnung[]> {
  const heute = new Date().toISOString().slice(0, 10);
  if (quelle === 'qonto') {
    return (await alle('qonto_client_invoices')).map(r => ({
      id: `q-${r.id}`, quelle, number: r.number, kunde: r.client_name, email: r.contact_email ?? null,
      amount: Number(r.total_amount || 0), currency: r.currency, issue: r.issue_date, due: r.due_date,
      paid: r.paid_at ? String(r.paid_at).slice(0, 10) : null, url: r.invoice_url ?? null,
      rawStatus: r.status, status: rechnungsStatus(quelle, r.status, r.due_date, heute), updated: r.updated_at_qonto ?? null,
    }));
  }
  return (await alle('lexoffice_invoices')).map(r => ({
    id: `l-${r.voucher_id}`, quelle, number: r.number, kunde: r.contact_name, email: null,
    amount: Number(r.total_amount || 0), currency: r.currency, issue: r.voucher_date, due: r.due_date,
    paid: r.paid_date, url: null, rawStatus: r.status, status: rechnungsStatus(quelle, r.status, r.due_date, heute),
    updated: r.updated_at ?? null,
  }));
}
