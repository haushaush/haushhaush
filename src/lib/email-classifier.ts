export type EmailCategory = 'important' | 'informational' | 'ignorable';

export interface ClassifiedEmail {
  email: any;
  category: EmailCategory;
  reasons: string[];
  priority: number;
}

export interface ClassifierRules {
  importantSenders: string[];
  importantKeywords: string[];
  ignorableSenders: string[];
  ignorableKeywords: string[];
}

export const DEFAULT_RULES: ClassifierRules = {
  importantSenders: [],
  importantKeywords: [
    'rechnung', 'invoice', 'vertrag', 'contract',
    'kündigung', 'mahnung', 'dringend', 'urgent',
    'angebot', 'proposal', 'unterzeichnung', 'signature',
    'meeting', 'termin', 'interview', 'kick-off',
    'frist', 'deadline', 'action required',
    'zahlung', 'payment', 'überweisung',
    'beschwerde', 'complaint', 'feedback',
  ],
  ignorableSenders: [
    'noreply@', 'no-reply@', 'donotreply@',
    'newsletter@', 'updates@',
    '@mail.cake.com',
    '@slackmail.com',
    '@notifications.slack.com',
    '@notion.so',
    '@github.com',
    '@linkedin.com',
    '@youtube.com',
    '@google.com',
    '@meta.com',
  ],
  ignorableKeywords: [
    'login code', 'login-code', 'anmeldecode',
    'verification code', 'verifizierungscode',
    'bestätigungscode', 'confirmation code',
    'one-time password', 'einmalpasswort',
    'password reset', 'passwort zurücksetzen',
    'newsletter', 'unsubscribe',
    'two-factor', '2fa', 'zwei-faktor',
    'account activity', 'security alert',
    'wöchentliche zusammenfassung', 'weekly digest',
  ],
};

export function classifyEmail(email: any, rules: ClassifierRules): ClassifiedEmail {
  const reasons: string[] = [];
  let priority = 50;

  const fromAddress = (email.from_address || '').toLowerCase();
  const subject = (email.subject || '').toLowerCase();
  const isUnread = !email.flags?.includes('\\Seen');
  const isFlagged = email.flags?.includes('\\Flagged');

  const validSubstr = (s: string) => s && s.trim().length > 1;

  const importantSenderHit = rules.importantSenders
    .filter(validSubstr)
    .find((s) => fromAddress.includes(s.toLowerCase()));
  if (importantSenderHit) {
    priority += 30;
    reasons.push(`Wichtiger Absender: ${importantSenderHit}`);
  }

  const importantKeywordHit = rules.importantKeywords
    .filter(validSubstr)
    .find((kw) => subject.includes(kw.toLowerCase()));
  if (importantKeywordHit) {
    priority += 25;
    reasons.push(`Schlüsselwort: ${importantKeywordHit}`);
  }

  const ignorableSenderHit = rules.ignorableSenders
    .filter(validSubstr)
    .find((s) => fromAddress.includes(s.toLowerCase()));
  if (ignorableSenderHit) {
    priority -= 35;
    reasons.push(`Auto-Mail: ${ignorableSenderHit}`);
  }

  const ignorableKeywordHit = rules.ignorableKeywords
    .filter(validSubstr)
    .find((kw) => subject.includes(kw.toLowerCase()));
  if (ignorableKeywordHit) {
    priority -= 30;
    reasons.push(`Routine: ${ignorableKeywordHit}`);
  }

  if (isFlagged) {
    priority += 20;
    reasons.push('Markiert (⭐)');
  }
  if (isUnread) {
    priority += 5;
  }

  let category: EmailCategory;
  if (priority >= 70) category = 'important';
  else if (priority <= 25) category = 'ignorable';
  else category = 'informational';

  return { email, category, reasons, priority };
}

export interface IgnorableGroup {
  sender: string;
  subject_pattern: string;
  count: number;
  emails: ClassifiedEmail[];
}

export function groupSimilarEmails(classified: ClassifiedEmail[]) {
  const important = classified
    .filter((c) => c.category === 'important')
    .sort((a, b) => b.priority - a.priority);

  const informational = classified
    .filter((c) => c.category === 'informational')
    .sort((a, b) => new Date(b.email.date ?? 0).getTime() - new Date(a.email.date ?? 0).getTime());

  const ignorableRaw = classified.filter((c) => c.category === 'ignorable');
  const groups = new Map<string, ClassifiedEmail[]>();

  for (const c of ignorableRaw) {
    const cleanSubject = (c.email.subject || '')
      .replace(/[A-Z0-9]{4,}/g, 'XXX')
      .replace(/\d{4,}/g, 'NNN')
      .toLowerCase()
      .trim();
    const key = `${c.email.from_address}::${cleanSubject}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const ignorable: IgnorableGroup[] = Array.from(groups.entries())
    .map(([key, emails]) => {
      const [sender] = key.split('::');
      return {
        sender: emails[0].email.from_name || sender,
        subject_pattern: emails[0].email.subject || '',
        count: emails.length,
        emails,
      };
    })
    .sort((a, b) => b.count - a.count);

  return { important, informational, ignorable };
}

export function calculateTimeSaved(ignorableCount: number, totalCount: number): number {
  const ignorableSaved = ignorableCount * 0.5;
  const otherSaved = (totalCount - ignorableCount) * 1.25;
  return Math.round(ignorableSaved + otherSaved);
}
