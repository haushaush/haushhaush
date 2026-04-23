// Pre-configured IMAP/SMTP settings for common providers
export interface ProviderPreset {
  key: string;
  name: string;
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  note?: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  gmail: {
    key: 'gmail',
    name: 'Gmail / Google Workspace',
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    smtp_secure: true,
    note: 'Benötigt App-Passwort (nicht das normale Passwort). Anleitung: myaccount.google.com/apppasswords',
  },
  outlook: {
    key: 'outlook',
    name: 'Outlook / Office 365',
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    smtp_secure: false,
    note: 'Benötigt App-Passwort bei aktivierter 2-Faktor-Authentifizierung',
  },
  ionos: {
    key: 'ionos',
    name: 'IONOS / 1&1',
    imap_host: 'imap.ionos.de',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.ionos.de',
    smtp_port: 465,
    smtp_secure: true,
    note: 'IMAP-Zugang muss im IONOS Kundencenter aktiviert sein',
  },
  gmx: {
    key: 'gmx',
    name: 'GMX',
    imap_host: 'imap.gmx.net',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'mail.gmx.net',
    smtp_port: 465,
    smtp_secure: true,
    note: 'POP3/IMAP Zugriff in den GMX Einstellungen aktivieren',
  },
  web_de: {
    key: 'web_de',
    name: 'Web.de',
    imap_host: 'imap.web.de',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.web.de',
    smtp_port: 587,
    smtp_secure: false,
    note: 'POP3/IMAP Zugriff in den Einstellungen aktivieren',
  },
  strato: {
    key: 'strato',
    name: 'Strato',
    imap_host: 'imap.strato.de',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'smtp.strato.de',
    smtp_port: 465,
    smtp_secure: true,
  },
  t_online: {
    key: 't_online',
    name: 'T-Online',
    imap_host: 'secureimap.t-online.de',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'securesmtp.t-online.de',
    smtp_port: 465,
    smtp_secure: true,
  },
  all_inkl: {
    key: 'all_inkl',
    name: 'all-inkl',
    imap_host: 'w00XXXXX.kasserver.com',
    imap_port: 993,
    imap_secure: true,
    smtp_host: 'w00XXXXX.kasserver.com',
    smtp_port: 465,
    smtp_secure: true,
    note: 'Server-Name (w00XXXXX) findest du im KAS unter E-Mail → Postfächer',
  },
  custom: {
    key: 'custom',
    name: 'Anderer Provider (manuell)',
    imap_host: '',
    imap_port: 993,
    imap_secure: true,
    smtp_host: '',
    smtp_port: 465,
    smtp_secure: true,
  },
};

export function inferProviderFromEmail(email: string): string | null {
  const lower = email.toLowerCase();
  if (lower.endsWith('@gmail.com') || lower.endsWith('@googlemail.com')) return 'gmail';
  if (lower.endsWith('@outlook.com') || lower.endsWith('@hotmail.com') || lower.endsWith('@live.com')) return 'outlook';
  if (lower.endsWith('@gmx.de') || lower.endsWith('@gmx.net') || lower.endsWith('@gmx.com')) return 'gmx';
  if (lower.endsWith('@web.de')) return 'web_de';
  if (lower.endsWith('@t-online.de')) return 't_online';
  return null;
}

export function errorCodeToMessage(code: string, raw?: string): string {
  switch (code) {
    case 'auth_failed':
      return 'E-Mail oder Passwort ist falsch. Bei Gmail/Outlook: bitte App-Passwort verwenden!';
    case 'connection_failed':
      return 'Server nicht erreichbar. Bitte Host und Port prüfen.';
    case 'tls_error':
      return 'SSL-Problem. SSL deaktivieren und einen anderen Port (z. B. 143) probieren.';
    case 'send_failed':
      return raw || 'Versand fehlgeschlagen.';
    default:
      return raw || 'Unbekannter Fehler.';
  }
}
