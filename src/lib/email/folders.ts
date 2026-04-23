// Special-use folder mapping → app-friendly slugs
import type { LucideIcon } from 'lucide-react';
import { Inbox, Send, Star, FileText, Trash2, Mail, AlertCircle } from 'lucide-react';

export type EmailRouteSlug = 'posteingang' | 'ungelesen' | 'gesendet' | 'wichtig' | 'entwuerfe' | 'papierkorb';

export interface RouteConfig {
  slug: EmailRouteSlug;
  label: string;
  icon: LucideIcon;
  /** Primary IMAP Special-Use flag (e.g. "\\Sent"). */
  specialUse?: string;
  /** Common name patterns (case-insensitive substring match on path AND name). */
  namePatterns?: string[];
  /** When true, this slug is a *filter* on the inbox, not its own folder. */
  isInboxFilter?: boolean;
}

export const ROUTE_CONFIGS: Record<EmailRouteSlug, RouteConfig> = {
  posteingang: {
    slug: 'posteingang',
    label: 'Posteingang',
    icon: Inbox,
    specialUse: '\\Inbox',
    namePatterns: ['inbox', 'posteingang'],
  },
  ungelesen: {
    slug: 'ungelesen',
    label: 'Ungelesen',
    icon: AlertCircle,
    isInboxFilter: true,
  },
  gesendet: {
    slug: 'gesendet',
    label: 'Gesendet',
    icon: Send,
    specialUse: '\\Sent',
    namePatterns: [
      'sent', 'gesendet', 'gesendete', 'gesendete elemente', 'gesendete objekte',
      'sent items', 'sent mail', 'sent messages', 'envoyés', 'verzonden',
    ],
  },
  wichtig: {
    slug: 'wichtig',
    label: 'Wichtig (markiert)',
    icon: Star,
    isInboxFilter: true,
  },
  entwuerfe: {
    slug: 'entwuerfe',
    label: 'Entwürfe',
    icon: FileText,
    specialUse: '\\Drafts',
    namePatterns: ['drafts', 'draft', 'entwürfe', 'entwurf', 'entwuerfe', 'brouillons'],
  },
  papierkorb: {
    slug: 'papierkorb',
    label: 'Papierkorb',
    icon: Trash2,
    specialUse: '\\Trash',
    namePatterns: [
      'trash', 'papierkorb', 'deleted', 'deleted items', 'deleted messages',
      'gelöscht', 'geloescht', 'gelöschte elemente', 'corbeille',
    ],
  },
};

type MailboxLike = { path: string; name?: string; specialUse?: string | null };

function findInboxPath(mailboxes: MailboxLike[]): string {
  const bySpecial = mailboxes.find((m) => m.specialUse === '\\Inbox');
  if (bySpecial) return bySpecial.path;
  const byName = mailboxes.find(
    (m) => m.path.toUpperCase() === 'INBOX' || (m.name ?? '').toLowerCase() === 'inbox',
  );
  return byName?.path ?? 'INBOX';
}

/**
 * Resolve a route slug to an actual IMAP folder path on the connected account.
 * Strategy:
 *  1. Inbox filters (ungelesen/wichtig) → always return the inbox path.
 *  2. Match by IMAP Special-Use flag (most reliable).
 *  3. Fallback: case-insensitive substring match on folder name OR path tail.
 *  4. Last resort: return inbox path so the UI doesn't break.
 */
export function resolveFolderPath(slug: EmailRouteSlug, mailboxes: MailboxLike[]): string {
  const cfg = ROUTE_CONFIGS[slug];
  const inbox = findInboxPath(mailboxes);

  if (cfg.isInboxFilter) return inbox;

  if (cfg.specialUse) {
    const m = mailboxes.find((b) => b.specialUse === cfg.specialUse);
    if (m) return m.path;
  }

  const patterns = (cfg.namePatterns ?? []).map((p) => p.toLowerCase());
  if (patterns.length > 0) {
    const m = mailboxes.find((b) => {
      const name = (b.name ?? '').toLowerCase();
      const path = b.path.toLowerCase();
      const tail = path.split(/[./]/).pop() ?? path;
      return patterns.some((p) => name === p || tail === p || name.includes(p) || path.endsWith(p));
    });
    if (m) return m.path;
  }

  return inbox;
}

/** True if the slug requires its own folder and that folder doesn't exist on the account. */
export function isFolderMissing(slug: EmailRouteSlug, mailboxes: MailboxLike[]): boolean {
  const cfg = ROUTE_CONFIGS[slug];
  if (cfg.isInboxFilter || slug === 'posteingang') return false;
  if (mailboxes.length === 0) return false;
  const resolved = resolveFolderPath(slug, mailboxes);
  // resolveFolderPath falls back to inbox when nothing matches → treat that as "missing"
  return resolved === findInboxPath(mailboxes);
}

export function emailColorFromAddress(email: string): string {
  // Hash to HSL hue
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function senderInitials(name: string | null, email: string): string {
  const src = (name && name.trim()) || email;
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

export function formatEmailDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Gestern';
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('de-DE');
}

export const EMAIL_ICON: LucideIcon = Mail;
