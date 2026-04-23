// Special-use folder mapping → app-friendly slugs
import type { LucideIcon } from 'lucide-react';
import { Inbox, Send, Star, FileText, Trash2, Mail, AlertCircle } from 'lucide-react';

export type EmailRouteSlug = 'posteingang' | 'ungelesen' | 'gesendet' | 'wichtig' | 'entwuerfe' | 'papierkorb';

export interface RouteConfig {
  slug: EmailRouteSlug;
  label: string;
  icon: LucideIcon;
  // What to look for in mailbox specialUse / path; fallbacks are searched in order
  specialUse?: string;
  fallbackPaths?: string[];
  filter?: 'unread';
}

export const ROUTE_CONFIGS: Record<EmailRouteSlug, RouteConfig> = {
  posteingang: { slug: 'posteingang', label: 'Posteingang', icon: Inbox, fallbackPaths: ['INBOX'] },
  ungelesen: { slug: 'ungelesen', label: 'Ungelesen', icon: AlertCircle, fallbackPaths: ['INBOX'], filter: 'unread' },
  gesendet: { slug: 'gesendet', label: 'Gesendet', icon: Send, specialUse: '\\Sent', fallbackPaths: ['Sent', 'INBOX.Sent', 'Gesendet', 'Sent Items'] },
  wichtig: { slug: 'wichtig', label: 'Wichtig (markiert)', icon: Star, fallbackPaths: ['INBOX'], filter: undefined },
  entwuerfe: { slug: 'entwuerfe', label: 'Entwürfe', icon: FileText, specialUse: '\\Drafts', fallbackPaths: ['Drafts', 'INBOX.Drafts', 'Entwürfe'] },
  papierkorb: { slug: 'papierkorb', label: 'Papierkorb', icon: Trash2, specialUse: '\\Trash', fallbackPaths: ['Trash', 'INBOX.Trash', 'Papierkorb', 'Deleted Items'] },
};

export function resolveFolderPath(
  slug: EmailRouteSlug,
  mailboxes: Array<{ path: string; specialUse: string | null }>,
): string {
  const cfg = ROUTE_CONFIGS[slug];
  if (cfg.specialUse) {
    const m = mailboxes.find((b) => b.specialUse === cfg.specialUse);
    if (m) return m.path;
  }
  for (const fb of cfg.fallbackPaths ?? []) {
    const m = mailboxes.find((b) => b.path === fb);
    if (m) return m.path;
  }
  return 'INBOX';
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
