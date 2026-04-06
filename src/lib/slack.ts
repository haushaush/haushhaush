import { supabase } from '@/integrations/supabase/client';

const getWebhookUrl = async (): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'slack_tech_support_webhook')
      .maybeSingle();

    if (data?.value) {
      return typeof data.value === 'string'
        ? data.value
        : (data.value as any)?.url || String(data.value);
    }
    return null;
  } catch {
    return null;
  }
};

interface SlackPayload {
  title: string;
  message?: string;
  fields?: { label: string; value: string }[];
  color?: 'red' | 'orange' | 'green' | 'blue' | 'default';
  url?: string;
  emoji?: string;
  imageUrl?: string;
}

export const sendSlackMessage = async (payload: SlackPayload): Promise<boolean> => {
  const webhookUrl = await getWebhookUrl();
  if (!webhookUrl) {
    console.warn('⚠️ Slack webhook not configured. Set slack_tech_support_webhook in Einstellungen → Benachrichtigungen.');
    return false;
  }

  const colorEmoji: Record<string, string> = {
    red: '🔴', orange: '🟡', green: '🟢', blue: '🔵', default: '⚪',
  };
  const icon = payload.emoji || colorEmoji[payload.color || 'default'];

  const blocks: any[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${icon} ${payload.title}`, emoji: true },
    },
    ...(payload.message ? [{
      type: 'section',
      text: { type: 'mrkdwn', text: payload.message },
    }] : []),
    ...(payload.fields?.length ? [{
      type: 'section',
      fields: payload.fields.map(f => ({
        type: 'mrkdwn',
        text: `*${f.label}:*\n${f.value}`,
      })),
    }] : []),
    ...(payload.imageUrl ? [{
      type: 'image',
      image_url: payload.imageUrl,
      alt_text: 'Screenshot',
    }] : []),
    ...(payload.url ? [{
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Im Portal öffnen →' },
        url: `${window.location.origin}${payload.url}`,
      }],
    }] : []),
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Agency Hub · ${new Date().toLocaleString('de-DE')}` }],
    },
  ];

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `${icon} ${payload.title}`, blocks }),
    });
    if (!res.ok) {
      console.error('Slack webhook failed:', res.status);
      return false;
    }
    console.log('✅ Slack notification sent:', payload.title);
    return true;
  } catch (err) {
    console.error('Slack send error:', err);
    return false;
  }
};

// Pre-built helpers

export const slackNotifyBugReport = (report: {
  user_name?: string | null;
  user_email?: string | null;
  page_url?: string | null;
  problem_type: string;
  description: string;
  screenshot_url?: string | null;
}) => {
  const typeEmoji: Record<string, string> = {
    Bug: '🐛', Darstellungsfehler: '🎨', 'Funktion fehlt': '➕',
    'Falscher Text': '✏️', Sonstiges: '📝',
  };
  return sendSlackMessage({
    title: `Bug-Report: ${report.problem_type}`,
    emoji: typeEmoji[report.problem_type] || '🐛',
    color: 'orange',
    message: report.description.slice(0, 500),
    fields: [
      { label: 'Gemeldet von', value: `${report.user_name || '–'} (${report.user_email || '–'})` },
      { label: 'Seite', value: `\`${report.page_url || '–'}\`` },
    ],
    imageUrl: report.screenshot_url || undefined,
  });
};

export const slackNotifySupportTicket = (ticket: {
  ticket_nr?: string;
  user_name?: string | null;
  user_email?: string | null;
  user_message: string;
  error_type?: string | null;
  error_message?: string | null;
  page_url?: string | null;
  priority?: string | null;
}) => {
  let message = ticket.user_message.slice(0, 500);
  if (ticket.error_message) {
    message += `\n\n*Fehlermeldung:*\n\`\`\`${ticket.error_message.slice(0, 300)}\`\`\``;
  }
  return sendSlackMessage({
    title: `Support-Ticket ${ticket.ticket_nr || ''}`,
    emoji: '🎫',
    color: 'orange',
    message,
    fields: [
      { label: 'Nutzer', value: `${ticket.user_name || '–'} (${ticket.user_email || '–'})` },
      { label: 'Typ', value: ticket.error_type || 'Support' },
      { label: 'Seite', value: ticket.page_url || '–' },
      { label: 'Priorität', value: ticket.priority || 'Normal' },
    ],
  });
};

export const slackNotifyNewDeal = (deal: {
  client_name: string;
  wert_eur?: number | null;
  art?: string | null;
  laufzeit_monate?: number | null;
  start_datum?: string | null;
  leistungen?: any;
}, userName: string) =>
  sendSlackMessage({
    title: `Neuer Abschluss: ${deal.client_name}`,
    emoji: '🎉',
    color: 'green',
    message: `*€${(deal.wert_eur || 0).toLocaleString('de-DE')}* · ${deal.art || ''} · ${deal.laufzeit_monate || '?'} Monate`,
    fields: [
      { label: 'Eingetragen von', value: userName },
      { label: 'Start', value: deal.start_datum || '–' },
      { label: 'Leistungen', value: Array.isArray(deal.leistungen) ? deal.leistungen.join(', ') : '–' },
    ],
    url: '/kunden/abschluesse',
  });

export const slackNotifyOverdueInvoice = (invoice: {
  client_name?: string | null;
  invoice_nr: string;
  brutto?: number | null;
  faelligkeitsdatum?: string | null;
}) =>
  sendSlackMessage({
    title: `Rechnung überfällig: ${invoice.client_name || '–'}`,
    emoji: '💶',
    color: 'red',
    message: `Rechnung **${invoice.invoice_nr}** ist seit ${invoice.faelligkeitsdatum || '–'} überfällig.`,
    fields: [
      { label: 'Betrag', value: `€${(invoice.brutto || 0).toLocaleString('de-DE')}` },
      { label: 'Fällig seit', value: invoice.faelligkeitsdatum || '–' },
    ],
    url: '/finanzen',
  });
