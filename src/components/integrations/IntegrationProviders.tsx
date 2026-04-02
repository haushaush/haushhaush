import type { IntegrationProvider } from './IntegrationCard';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';

const iconStyle = (bg: string, text: string) => (
  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-base`} style={{ background: bg, color: text }}>
    {text === '#fff' ? '' : ''}
  </div>
);

export const PROVIDERS: IntegrationProvider[] = [
  // CRM
  {
    id: 'close_crm',
    name: 'Close CRM',
    category: 'CRM',
    icon: <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">C</div>,
    description: 'Deals und Kontakte synchronisieren',
    fields: [
      { key: 'webhook_url', label: 'Webhook URL (n8n → Dashboard)', type: 'text', placeholder: 'https://n8n...' },
      { key: 'api_key', label: 'Close API Key', type: 'password', placeholder: 'api_key_...' },
    ],
    toggles: [{ key: 'auto_sync', label: 'Auto-Sync (alle 15 Min.)' }],
    webhookUrl: `${SUPABASE_URL}/functions/v1/webhook-receiver/close`,
    docUrl: 'https://developer.close.com/',
    actions: [
      { label: 'Synchronisieren', variant: 'outline', action: 'sync' },
      { label: 'Speichern', action: 'save' },
    ],
  },
  // Marketing
  {
    id: 'meta_ads',
    name: 'Meta Ads',
    category: 'Marketing',
    icon: <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold">M</div>,
    description: 'Ad Accounts und Kampagnen verwalten',
    fields: [
      { key: 'ad_account_id', label: 'Ad Account ID', type: 'text', placeholder: 'act_...' },
      { key: 'pixel_id', label: 'Pixel ID', type: 'text', placeholder: '...' },
    ],
    docUrl: 'https://developers.facebook.com/docs/marketing-apis',
    actions: [
      { label: 'Verbinden', action: 'connect' },
    ],
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    category: 'Marketing',
    icon: <div className="w-10 h-10 rounded-lg bg-white border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-blue-500">G</div>,
    description: 'Google Ads Kampagnen',
    comingSoon: true,
    fields: [],
    actions: [],
  },
  // Kommunikation
  {
    id: 'slack',
    name: 'Slack',
    category: 'Kommunikation',
    icon: <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">#</div>,
    description: 'Benachrichtigungen und Automatisierungen',
    fields: [
      { key: 'workspace', label: 'Workspace', type: 'readonly', defaultValue: 'haushhaush.slack.com' },
      { key: 'channel_abschluesse', label: 'Abschlüsse Channel ID', type: 'text', defaultValue: 'C0AAN7SARLH' },
      { key: 'channel_laufzeiten', label: 'Laufzeiten Channel ID', type: 'text', defaultValue: 'C0AEKP0HNV8' },
      { key: 'channel_buchhaltung', label: 'Buchhaltung Channel ID', type: 'text', defaultValue: 'C0AA3R29KSP' },
    ],
    toggles: [
      { key: 'notify_abschluesse', label: 'Benachrichtigungen #abschlüsse' },
      { key: 'notify_laufzeiten', label: 'Benachrichtigungen #laufzeiten' },
      { key: 'notify_buchhaltung', label: 'Benachrichtigungen #buchhaltung' },
    ],
    webhookUrl: `${SUPABASE_URL}/functions/v1/webhook-receiver/slack`,
    actions: [
      { label: 'Test senden', variant: 'outline', action: 'test' },
      { label: 'Speichern', action: 'save' },
    ],
  },
  {
    id: 'email',
    name: 'E-Mail (Gmail / IMAP)',
    category: 'Kommunikation',
    icon: <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold">✉</div>,
    description: 'E-Mail Postfächer synchronisieren',
    fields: [
      { key: 'imap_host', label: 'IMAP Host', type: 'text', placeholder: 'imap.gmail.com' },
      { key: 'imap_port', label: 'Port', type: 'text', placeholder: '993' },
      { key: 'imap_user', label: 'Benutzername', type: 'text', placeholder: 'user@example.com' },
      { key: 'imap_pass', label: 'Passwort', type: 'password' },
    ],
    actions: [
      { label: 'Testen', variant: 'outline', action: 'test' },
      { label: 'Verbinden', action: 'save' },
    ],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'Kommunikation',
    icon: <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center text-white font-bold">W</div>,
    description: 'WhatsApp Business API',
    comingSoon: true,
    fields: [],
    actions: [],
  },
  // Finanzen
  {
    id: 'qonto',
    name: 'Qonto',
    category: 'Finanzen',
    icon: <div className="w-10 h-10 rounded-lg bg-[var(--color-teal)] flex items-center justify-center text-white font-bold">Q</div>,
    description: 'Banking & Transaktionen',
    fields: [
      { key: 'org_slug', label: 'Organisation Slug', type: 'text', placeholder: 'haush-haush-digital' },
      { key: 'api_key', label: 'API Key', type: 'password' },
    ],
    toggles: [{ key: 'auto_sync', label: 'Automatisch synchronisieren' }],
    docUrl: 'https://api-doc.qonto.com/',
    actions: [
      { label: 'Jetzt synchronisieren', variant: 'outline', action: 'sync' },
      { label: 'Verbinden', action: 'save' },
    ],
  },
  {
    id: 'datev',
    name: 'DATEV',
    category: 'Finanzen',
    icon: <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold">D</div>,
    description: 'Buchhaltung & Steuern',
    comingSoon: true,
    fields: [],
    actions: [],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Finanzen',
    icon: <div className="w-10 h-10 rounded-lg bg-purple-600 flex items-center justify-center text-white font-bold">S</div>,
    description: 'Zahlungsabwicklung',
    comingSoon: true,
    fields: [],
    actions: [],
  },
  // Automatisierung
  {
    id: 'n8n',
    name: 'n8n',
    category: 'Automatisierung',
    icon: <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold">⚡</div>,
    description: 'Workflow-Automatisierung',
    fields: [
      { key: 'outgoing_webhook', label: 'Outgoing Webhook URL', type: 'text', placeholder: 'https://n8n...' },
      { key: 'incoming_webhook', label: 'Incoming Webhook URL', type: 'text', placeholder: 'https://...' },
    ],
    webhookUrl: `${SUPABASE_URL}/functions/v1/webhook-receiver/n8n`,
    docUrl: 'https://docs.n8n.io/',
    actions: [
      { label: 'Verbindung testen', variant: 'outline', action: 'test' },
      { label: 'Speichern', action: 'save' },
    ],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    category: 'Automatisierung',
    icon: <div className="w-10 h-10 rounded-lg bg-orange-600 flex items-center justify-center text-white font-bold">Z</div>,
    description: 'Verwende unsere API um Zaps zu erstellen',
    fields: [
      { key: 'webhook_url', label: 'Zapier Webhook URL', type: 'text', placeholder: 'https://hooks.zapier.com/...' },
    ],
    docUrl: 'https://zapier.com/developer',
    actions: [{ label: 'Speichern', action: 'save' }],
  },
  {
    id: 'make',
    name: 'Make (Integromat)',
    category: 'Automatisierung',
    icon: <div className="w-10 h-10 rounded-lg bg-purple-700 flex items-center justify-center text-white font-bold">M</div>,
    description: 'Visual Automation Platform',
    fields: [
      { key: 'webhook_url', label: 'Make Webhook URL', type: 'text', placeholder: 'https://hook.eu1.make.com/...' },
    ],
    docUrl: 'https://www.make.com/en/api-documentation',
    actions: [{ label: 'Speichern', action: 'save' }],
  },
  // Storage
  {
    id: 'google_drive',
    name: 'Google Drive',
    category: 'Storage',
    icon: <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center text-white font-bold">📁</div>,
    description: 'Dokumente & Dateien',
    fields: [
      { key: 'root_folder_id', label: 'Root-Ordner ID', type: 'text', placeholder: '1abc...' },
    ],
    docUrl: 'https://developers.google.com/drive',
    actions: [
      { label: 'Ordnerstruktur aufbauen', variant: 'outline', action: 'build_structure' },
      { label: 'Verbinden', action: 'connect' },
    ],
  },
  // Landing Pages
  {
    id: 'onepage',
    name: 'OnePage.io',
    category: 'Landing Pages',
    icon: <div className="w-10 h-10 rounded-lg bg-[var(--color-teal)] flex items-center justify-center text-white font-bold">🌐</div>,
    description: 'Landing Pages & Formulare',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', placeholder: 'op_key_...' },
    ],
    docUrl: 'https://app.onepage.io',
    actions: [
      { label: 'Verbindung testen', variant: 'outline', action: 'test' },
      { label: 'Speichern', action: 'save' },
    ],
  },
  {
    id: 'superchat',
    name: 'Superchat',
    category: 'CRM/Chat',
    icon: <div className="w-10 h-10 rounded-lg bg-[var(--color-teal)] flex items-center justify-center text-white font-bold">💬</div>,
    description: 'Kundenkommunikation',
    comingSoon: true,
    fields: [],
    actions: [],
  },
];

export const CATEGORIES = [
  'Alle', 'Verbunden', 'CRM', 'Marketing', 'Finanzen', 'Kommunikation', 'Automatisierung', 'Storage', 'Landing Pages',
];
